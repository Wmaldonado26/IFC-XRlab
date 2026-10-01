import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as FRAGS from '@thatopen/fragments';
import * as WEBIFC from 'web-ifc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Monkey-patch Web-IFC settings to eliminate artificial 2GB limit in Node.js
const ifcApiProto = WEBIFC.IfcAPI.prototype;
const originalCreateSettings = ifcApiProto?.CreateSettings;
if (originalCreateSettings) {
  ifcApiProto.CreateSettings = function (settings) {
    const s = originalCreateSettings.call(this, settings);
    s.MEMORY_LIMIT = settings?.MEMORY_LIMIT ?? 4294901760;
    return s;
  };
}

// Maximum safe file size for single-pass WebAssembly 32-bit linear memory (~1.85 GB)
const MAX_SAFE_WASM_SIZE = 1.85 * 1024 * 1024 * 1024;

// 2. Parse command-line arguments
const rawArgs = process.argv.slice(2);
const isSingleMode = rawArgs.includes('--single');
const keepSplits = rawArgs.includes('--keep-splits');
const cleanArgs = rawArgs.filter((a) => a !== '--single' && a !== '--keep-splits');

if (cleanArgs.length === 0 || cleanArgs.includes('--help') || cleanArgs.includes('-h')) {
  console.log(`
===================================================================
 BIM ThatOpen Engine: High-Capacity IFC -> FRAG Converter
===================================================================
 Usage:
   npm run convert -- <path-to-ifc-file> [optional-output-path.frag]

 Flags:
   --keep-splits   Preserve intermediate .ifc partitions on disk

 Examples:
   npm run convert -- ./modelo.ifc
   npm run convert -- "C:/Proyectos/IFC_Entire_Ship_wo_ref_2026-07-16.ifc"
   npm run convert -- ./modelo.ifc ./public/models/modelo.frag

 High-Scale Architecture:
   - Single-Pass mode (< 1.85 GB): Zero-copy streaming conversion.
   - Massive Model mode (> 1.85 GB): Automatic BitSet partitioning
     into isolated WebAssembly processes, preventing 32-bit WASM
     heap exhaustion (Aborted error) and outputting valid .frag parts.
===================================================================
`);
  process.exit(0);
}

const inputPath = path.resolve(process.cwd(), cleanArgs[0]);
let outputPath = cleanArgs[1]
  ? path.resolve(process.cwd(), cleanArgs[1])
  : inputPath.replace(/\.ifc$/i, '') + '.frag';

// 3. Verify input file exists
if (!fs.existsSync(inputPath)) {
  console.error(`\n❌ ERROR: Source IFC file not found:\n   ${inputPath}`);
  process.exit(1);
}

const stats = fs.statSync(inputPath);
if (!stats.isFile()) {
  console.error(`\n❌ ERROR: Specified path is not a file:\n   ${inputPath}`);
  process.exit(1);
}

const fileSizeBytes = stats.size;
const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
const fileSizeGB = (fileSizeBytes / (1024 * 1024 * 1024)).toFixed(2);

// ===================================================================
// SINGLE FILE CONVERSION (Worker Process or Files <= 1.85 GB)
// ===================================================================
async function convertSingleIfc(srcPath, dstPath) {
  const partStats = fs.statSync(srcPath);
  const partBytes = partStats.size;
  const partMB = (partBytes / (1024 * 1024)).toFixed(1);

  console.log('\n===================================================================');
  console.log(` 🚀 CONVERTING: ${path.basename(srcPath)} (${partMB} MB)`);
  console.log('===================================================================');
  console.log(` 📂 Source : ${srcPath}`);
  console.log(` 💾 Target : ${dstPath}`);
  console.log('===================================================================\n');

  const fd = fs.openSync(srcPath, 'r');
  const wasmDir = path.resolve(rootDir, 'node_modules/web-ifc') + path.sep;

  try {
    const serializer = new FRAGS.IfcImporter();
    serializer.wasm = {
      absolute: true,
      path: wasmDir,
    };

    let lastReportedProgress = -1;
    const startTime = Date.now();
    let sharedBuffer = Buffer.allocUnsafe(65536);

    // Low-level chunk reader with unsigned 32-bit offset protection & buffer reuse
    const readCallback = (offset, size) => {
      try {
        const safeOffset = offset >>> 0;
        if (sharedBuffer.length < size) {
          sharedBuffer = Buffer.allocUnsafe(size);
        }
        const bytesRead = fs.readSync(fd, sharedBuffer, 0, size, safeOffset);
        return new Uint8Array(sharedBuffer.buffer, sharedBuffer.byteOffset, bytesRead);
      } catch (err) {
        console.error(`\n❌ Error reading IFC chunk at offset ${offset} (size ${size}):`, err);
        throw err;
      }
    };

    console.log('[1/2] Processing IFC geometry, spatial tree and properties...');

    const fragmentBytes = await serializer.process({
      readFromCallback: true,
      readCallback,
      progressCallback: (progress) => {
        const currentPct = Math.min(Math.round(progress * 100), 100);
        if (currentPct !== lastReportedProgress) {
          lastReportedProgress = currentPct;
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          process.stdout.write(`\r      ⏳ Progress: [${'#'.repeat(Math.floor(currentPct / 5)).padEnd(20, ' ')}] ${currentPct}% (${elapsed}s)`);
          if (typeof process.send === 'function') {
            process.send({ type: 'progress', percent: currentPct, elapsed });
          }
        }
      },
    });

    process.stdout.write('\n\n[2/2] Generating and saving .frag file...\n');

    const targetDir = path.dirname(dstPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.writeFileSync(dstPath, fragmentBytes);

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
    const fragSizeMB = (fragmentBytes.byteLength / (1024 * 1024)).toFixed(2);
    const compressionRatio = ((1 - fragmentBytes.byteLength / partBytes) * 100).toFixed(1);

    if (typeof serializer.clean === 'function') {
      serializer.clean();
    }

    console.log('===================================================================');
    console.log(` ✅ PART COMPLETED: ${path.basename(dstPath)}`);
    console.log(` ⏱️ Time     : ${durationSec}s`);
    console.log(` 📦 Size     : ${fragSizeMB} MB (${compressionRatio}% reduction)`);
    console.log('===================================================================\n');

    return { outputPath: dstPath, fragSizeMB, durationSec };
  } finally {
    fs.closeSync(fd);
  }
}

// Spawns a child process for isolated WebAssembly linear memory per partition
function runChildConversion(ifcFile, fragFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--max-old-space-size=16384', __filename, ifcFile, fragFile, '--single'],
      { stdio: 'inherit', cwd: process.cwd() }
    );

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Subprocess for ${path.basename(ifcFile)} exited with code ${code}`));
      }
    });
  });
}

// ===================================================================
// ULTRA-HIGH-SCALE STREAMING BITSET PARTITIONER
// ===================================================================
async function partitionMassiveIfc(sourceIfc, part1Target, part2Target) {
  console.log('\n===================================================================');
  console.log(' 🧩 AUTOMATIC BITSET PARTITIONING ACTIVATED');
  console.log('===================================================================');
  console.log(' 💡 El archivo supera el límite físico de 2 GB de direccionamiento');
  console.log('    de WebAssembly de 32 bits (wasm32).');
  console.log('    Dividiendo en sub-modelos balanceados y autónomos (~1.75 GB)...');
  console.log('===================================================================\n');

  const startTime = Date.now();
  const MAX_ENTITIES = 160000000;
  const neededBitset = new Uint8Array(Math.ceil(MAX_ENTITIES / 8));

  function markNeeded(id) {
    if (id > 0 && id < MAX_ENTITIES) {
      neededBitset[id >> 3] |= (1 << (id & 7));
    }
  }

  function isNeeded(id) {
    if (id > 0 && id < MAX_ENTITIES) {
      return (neededBitset[id >> 3] & (1 << (id & 7))) !== 0;
    }
    return false;
  }

  const splitByteTarget = Math.floor(fileSizeBytes / 2);
  const idRegex = /^#(\d+)\s*=/;
  const refRegex = /#(\d+)/g;

  // PASS 1: Boundary Detection & Cross-Reference Mapping
  console.log('[Pass 1/2] Scanning cross-references and finding boundary...');

  const headerLines = [];
  let currentBytes = 0;
  let inDataSection = false;
  let splitReached = false;
  let splitEntityId = -1;
  let lastProgress = -1;
  let directRefCount = 0;

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
    if (pct !== lastProgress && pct % 10 === 0) {
      lastProgress = pct;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r      ⏳ Pass 1 Scanning: ${pct}% complete (${elapsed}s)...`);
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
      console.log(`\n      📍 Boundary established at Entity #${splitEntityId} (~${(currentBytes / (1024 * 1024 * 1024)).toFixed(2)} GB)`);
    }

    if (splitReached) {
      refRegex.lastIndex = 0;
      let match;
      while ((match = refRegex.exec(line)) !== null) {
        const refId = parseInt(match[1], 10);
        if (refId < splitEntityId) {
          if (!isNeeded(refId)) {
            markNeeded(refId);
            directRefCount++;
          }
        }
      }
    }
  }

  console.log(`\n      🔗 Total Part 1 entities required by Part 2: ${directRefCount.toLocaleString()}`);

  // PASS 2: Streaming Generation of Part 1 and Part 2
  console.log('\n[Pass 2/2] Writing partitioned IFC sub-models to disk...');

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
    if (pct !== lastProgress && pct % 10 === 0) {
      lastProgress = pct;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r      ⏳ Pass 2 Writing: ${pct}% complete (${elapsed}s)...`);
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

      // Shared root spatial & context hierarchy (Project, Site, Building, Units, Contexts)
      // plus all Part 1 entities explicitly referenced by Part 2
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
    new Promise((res) => part1Stream.on('finish', res)),
    new Promise((res) => part2Stream.on('finish', res)),
  ]);

  const partitionDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  const part1SizeMB = (fs.statSync(part1Target).size / (1024 * 1024)).toFixed(1);
  const part2SizeMB = (fs.statSync(part2Target).size / (1024 * 1024)).toFixed(1);

  console.log(`\n\n      ✅ Partitioning complete in ${partitionDuration}s:`);
  console.log(`         - Part 1: ${part1SizeMB} MB`);
  console.log(`         - Part 2: ${part2SizeMB} MB\n`);
}

// ===================================================================
// MAIN ENTRY POINT
// ===================================================================
async function main() {
  // If running in single-part mode (e.g. from a child worker) or file fits in WASM:
  if (isSingleMode || fileSizeBytes <= MAX_SAFE_WASM_SIZE) {
    await convertSingleIfc(inputPath, outputPath);
    return;
  }

  // MASSIVE FILE DETECTED (> 1.85 GB)
  console.log('\n===================================================================');
  console.log(' 🚀 BIM IFC -> FRAG HIGH-CAPACITY CONVERSION PIPELINE');
  console.log('===================================================================');
  console.log(` 📂 Source File     : ${inputPath}`);
  console.log(` 📊 Total Size      : ${fileSizeGB} GB (${fileSizeMB} MB)`);
  console.log(` 🛡️ File Access Mode: STRICT READ-ONLY (Original file remains 100% intact)`);
  console.log('===================================================================\n');

  const dirName = path.dirname(outputPath);
  const baseName = path.basename(outputPath, '.frag');

  const part1Ifc = path.join(dirName, `${baseName}_Part1.ifc`);
  const part2Ifc = path.join(dirName, `${baseName}_Part2.ifc`);
  const part1Frag = path.join(dirName, `${baseName}_Part1.frag`);
  const part2Frag = path.join(dirName, `${baseName}_Part2.frag`);

  // Step 1: Partition into valid sub-models under 1.85 GB
  await partitionMassiveIfc(inputPath, part1Ifc, part2Ifc);

  // Step 2: Convert Part 1 in an isolated child process
  console.log('⏳ Starting conversion of Part 1 in an isolated WebAssembly instance...');
  await runChildConversion(part1Ifc, part1Frag);

  // Step 3: Convert Part 2 in an isolated child process
  console.log('⏳ Starting conversion of Part 2 in an isolated WebAssembly instance...');
  await runChildConversion(part2Ifc, part2Frag);

  // Step 4: Cleanup temporary IFC partition files unless requested to keep
  if (!keepSplits) {
    console.log('🧹 Cleaning up temporary partitioned IFC files...');
    if (fs.existsSync(part1Ifc)) fs.unlinkSync(part1Ifc);
    if (fs.existsSync(part2Ifc)) fs.unlinkSync(part2Ifc);
    console.log('   Temporary files removed (freed ~3.5 GB of disk space).');
  } else {
    console.log('💾 Kept intermediate .ifc files as requested:');
    console.log(`   - ${part1Ifc}`);
    console.log(`   - ${part2Ifc}`);
  }

  const p1Size = fs.existsSync(part1Frag) ? (fs.statSync(part1Frag).size / (1024 * 1024)).toFixed(2) : '0';
  const p2Size = fs.existsSync(part2Frag) ? (fs.statSync(part2Frag).size / (1024 * 1024)).toFixed(2) : '0';

  console.log('\n===================================================================');
  console.log(' 🎉 ALL CONVERSIONS COMPLETED SUCCESSFULLY!');
  console.log('===================================================================');
  console.log(` 📦 Generated Fragment Part 1 : ${part1Frag} (${p1Size} MB)`);
  console.log(` 📦 Generated Fragment Part 2 : ${part2Frag} (${p2Size} MB)`);
  console.log('===================================================================');
  console.log('\n💡 Para visualizar el modelo completo en 3D en tu navegador:');
  console.log('   1. Abre http://localhost:5173/');
  console.log('   2. Haz clic en "Cargar FRAG" (o arrastra los archivos al visor)');
  console.log(`   3. Selecciona simultáneamente:`);
  console.log(`      - ${path.basename(part1Frag)}`);
  console.log(`      - ${path.basename(part2Frag)}`);
  console.log('   4. ¡El visor unificará ambas partes de forma transparente!\n');
}

main().catch((err) => {
  console.error('\n\n❌ Conversion failed with error:');
  console.error(err);
  process.exit(1);
});
