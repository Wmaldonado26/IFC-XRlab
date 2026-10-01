import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fork } from 'node:child_process';
import type { Job } from './types.js';

const MAX_SAFE_WASM_SIZE = 1.85 * 1024 * 1024 * 1024; // 1.85 GB limit for 32-bit wasm
const SCRIPT_CONVERT = path.resolve(process.cwd(), 'scripts', 'convert-ifc.js');

/**
 * Executes a single conversion in an isolated child Node.js process with dedicated 16GB heap
 * and fresh WebAssembly linear memory.
 */
function runWorkerConversion(
  srcIfc: string,
  dstFrag: string,
  onProgress?: (percent: number, elapsed?: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = fork(
      SCRIPT_CONVERT,
      [srcIfc, dstFrag, '--single'],
      {
        execArgv: ['--max-old-space-size=16384'],
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      }
    );

    child.on('message', (msg: any) => {
      if (msg && msg.type === 'progress' && onProgress) {
        onProgress(msg.percent, msg.elapsed);
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Error al iniciar subproceso de conversión: ${err.message}`));
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Subproceso de conversión finalizó con código de salida ${code}`));
      }
    });
  });
}

/**
 * High-Scale Streaming BitSet Partitioner
 * Divides IFC files > 1.85 GB into autonomous, balanced partitions under the 32-bit WASM limit.
 */
async function partitionMassiveIfc(
  sourceIfc: string,
  part1Target: string,
  part2Target: string,
  fileSizeBytes: number,
  onProgress: (percent: number, stage: string, elapsed?: string) => void
): Promise<void> {
  const startTime = Date.now();
  const MAX_ENTITIES = 160000000;
  const neededBitset = new Uint8Array(Math.ceil(MAX_ENTITIES / 8));

  const markNeeded = (id: number) => {
    if (id > 0 && id < MAX_ENTITIES) {
      neededBitset[id >> 3] |= (1 << (id & 7));
    }
  };

  const isNeeded = (id: number): boolean => {
    if (id > 0 && id < MAX_ENTITIES) {
      return (neededBitset[id >> 3] & (1 << (id & 7))) !== 0;
    }
    return false;
  };

  const splitByteTarget = Math.floor(fileSizeBytes / 2);
  const idRegex = /^#(\d+)\s*=/;
  const refRegex = /#(\d+)/g;

  // PASS 1: Boundary Detection & Cross-Reference Mapping
  const headerLines: string[] = [];
  let currentBytes = 0;
  let inDataSection = false;
  let splitReached = false;
  let splitEntityId = -1;
  let lastProgress = -1;

  const pass1Stream = fs.createReadStream(sourceIfc, {
    encoding: 'utf8',
    highWaterMark: 1024 * 1024 * 8,
  });

  const rl1 = readline.createInterface({
    input: pass1Stream,
    crlfDelay: Infinity,
  });

  for await (const line of rl1) {
    const lineLen = Buffer.byteLength(line, 'utf8') + 1;
    currentBytes += lineLen;

    const pct = Math.min(Math.floor((currentBytes / fileSizeBytes) * 100), 100);
    if (pct !== lastProgress && pct % 5 === 0) {
      lastProgress = pct;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
      const overallPct = Math.min(Math.floor(pct * 0.25), 25);
      onProgress(overallPct, 'Pass 1/2: Escaneo de referencias cruzadas BitSet', elapsed);
    }

    if (!inDataSection) {
      headerLines.push(line);
      if (line.trim().toUpperCase() === 'DATA;') {
        inDataSection = true;
      }
      continue;
    }

    if (line.trim().toUpperCase() === 'ENDSEC;') {
      break;
    }

    const idMatch = line.match(idRegex);
    if (!idMatch) continue;

    const id = parseInt(idMatch[1], 10);

    if (!splitReached && currentBytes >= splitByteTarget) {
      splitReached = true;
      splitEntityId = id;
    }

    if (splitReached) {
      refRegex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = refRegex.exec(line)) !== null) {
        const refId = parseInt(match[1], 10);
        if (refId < splitEntityId) {
          if (!isNeeded(refId)) {
            markNeeded(refId);
          }
        }
      }
    }
  }

  // PASS 2: Streaming Generation of Part 1 and Part 2
  const part1Stream = fs.createWriteStream(part1Target, { encoding: 'utf8' });
  const part2Stream = fs.createWriteStream(part2Target, { encoding: 'utf8' });

  const headerContent = headerLines.join('\n') + '\n';
  part1Stream.write(headerContent);
  part2Stream.write(headerContent);

  const pass2Stream = fs.createReadStream(sourceIfc, {
    encoding: 'utf8',
    highWaterMark: 1024 * 1024 * 8,
  });

  const rl2 = readline.createInterface({
    input: pass2Stream,
    crlfDelay: Infinity,
  });

  currentBytes = 0;
  inDataSection = false;
  splitReached = false;
  let part1Closed = false;
  lastProgress = -1;

  for await (const line of rl2) {
    const lineLen = Buffer.byteLength(line, 'utf8') + 1;
    currentBytes += lineLen;

    const pct = Math.min(Math.floor((currentBytes / fileSizeBytes) * 100), 100);
    if (pct !== lastProgress && pct % 5 === 0) {
      lastProgress = pct;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1) + 's';
      const overallPct = 25 + Math.min(Math.floor(pct * 0.25), 25);
      onProgress(overallPct, 'Pass 2/2: Generación física de particiones intermedias', elapsed);
    }

    if (!inDataSection) {
      if (line.trim().toUpperCase() === 'DATA;') {
        inDataSection = true;
      }
      continue;
    }

    if (line.trim().toUpperCase() === 'ENDSEC;') {
      break;
    }

    const idMatch = line.match(idRegex);
    if (!idMatch) {
      if (!splitReached) {
        part1Stream.write(line + '\n');
      } else {
        part2Stream.write(line + '\n');
      }
      continue;
    }

    const id = parseInt(idMatch[1], 10);
    if (id >= splitEntityId) {
      splitReached = true;
    }

    if (!splitReached) {
      part1Stream.write(line + '\n');

      if (id <= 1000 || isNeeded(id)) {
        part2Stream.write(line + '\n');
      }
    } else {
      if (!part1Closed) {
        part1Stream.write('ENDSEC;\nEND-ISO-10303-21;\n');
        part1Stream.end();
        part1Closed = true;
      }

      part2Stream.write(line + '\n');
    }
  }

  part2Stream.write('ENDSEC;\nEND-ISO-10303-21;\n');
  part2Stream.end();

  await Promise.all([
    new Promise<void>((res) => part1Stream.on('finish', () => res())),
    new Promise<void>((res) => part2Stream.on('finish', () => res())),
  ]);
}

/**
 * Main Conversion Pipeline for a Job
 */
export async function convertIfcJob(
  job: Job,
  onProgress: (percent: number, stage: string, elapsed?: string) => void
): Promise<string[]> {
  const sourcePath = job.sourceFile;
  const stats = fs.statSync(sourcePath);
  const fileSize = stats.size;
  const baseName = path.basename(job.fileName, path.extname(job.fileName));

  // Mode 1: File fits directly in single WebAssembly linear memory (<= 1.85 GB)
  if (fileSize <= MAX_SAFE_WASM_SIZE) {
    const singleFragName = `${baseName}.frag`;
    const singleFragPath = path.join(job.tempDir, singleFragName);

    onProgress(0, 'Iniciando conversión en WebAssembly aislado...', '0s');

    await runWorkerConversion(sourcePath, singleFragPath, (pct, elapsed) => {
      onProgress(pct, 'Conversión WebAssembly (Paso único)', elapsed);
    });

    // Cleanup source file immediately to free disk space
    if (fs.existsSync(sourcePath)) {
      try {
        fs.unlinkSync(sourcePath);
      } catch {
        // ignore
      }
    }

    return [singleFragName];
  }

  // Mode 2: Massive File (> 1.85 GB) requiring BitSet partitioning
  const part1Ifc = path.join(job.tempDir, `${baseName}_Part1.ifc`);
  const part2Ifc = path.join(job.tempDir, `${baseName}_Part2.ifc`);
  const part1FragName = `${baseName}_Part1.frag`;
  const part2FragName = `${baseName}_Part2.frag`;
  const part1FragPath = path.join(job.tempDir, part1FragName);
  const part2FragPath = path.join(job.tempDir, part2FragName);

  // 1. Partitioning
  await partitionMassiveIfc(sourcePath, part1Ifc, part2Ifc, fileSize, onProgress);

  // Remove source.ifc immediately after partitioning to free 3.5GB+ disk space
  if (fs.existsSync(sourcePath)) {
    try {
      fs.unlinkSync(sourcePath);
    } catch {
      // ignore
    }
  }

  // 2. Convert Part 1 in isolated subprocess
  onProgress(50, 'Conversión Parte 1/2 en WebAssembly aislado...', '0s');
  await runWorkerConversion(part1Ifc, part1FragPath, (pct, elapsed) => {
    const overall = 50 + Math.floor(pct * 0.25);
    onProgress(overall, 'Conversión Parte 1/2 en WebAssembly aislado', elapsed);
  });

  // Remove part1.ifc immediately
  if (fs.existsSync(part1Ifc)) {
    try {
      fs.unlinkSync(part1Ifc);
    } catch {
      // ignore
    }
  }

  // 3. Convert Part 2 in isolated subprocess
  onProgress(75, 'Conversión Parte 2/2 en WebAssembly aislado...', '0s');
  await runWorkerConversion(part2Ifc, part2FragPath, (pct, elapsed) => {
    const overall = 75 + Math.floor(pct * 0.25);
    onProgress(overall, 'Conversión Parte 2/2 en WebAssembly aislado', elapsed);
  });

  // Remove part2.ifc immediately
  if (fs.existsSync(part2Ifc)) {
    try {
      fs.unlinkSync(part2Ifc);
    } catch {
      // ignore
    }
  }

  return [part1FragName, part2FragName];
}
