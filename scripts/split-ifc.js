import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
===================================================================
 BIM ThatOpen Engine: Ultra-High-Scale IFC Partitioner (BitSet)
===================================================================
 Usage:
   npm run split -- <path-to-massive-ifc-file>

 Examples:
   npm run split -- "C:/Users/wmaldonado/Desktop/IFC_Entire_Ship_wo_ref_2026-07-16.ifc"

 Features:
   - STRICT READ-ONLY access to source file.
   - Ultra-low memory footprint using BitSet (supports 150M+ entities
     without hitting V8 Map 16.7M element limit).
   - Generates Part1.ifc and Part2.ifc, each ~1.75 GB.
===================================================================
`);
  process.exit(0);
}

const inputPath = path.resolve(process.cwd(), args[0]);

if (!fs.existsSync(inputPath)) {
  console.error(`\n❌ ERROR: Source IFC file not found:\n   ${inputPath}`);
  process.exit(1);
}

const stats = fs.statSync(inputPath);
if (!stats.isFile()) {
  console.error(`\n❌ ERROR: Specified path is not a file:\n   ${inputPath}`);
  process.exit(1);
}

const totalBytes = stats.size;
const totalGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
const dirName = path.dirname(inputPath);
const baseName = path.basename(inputPath, path.extname(inputPath));

const part1Path = path.join(dirName, `${baseName}_Part1.ifc`);
const part2Path = path.join(dirName, `${baseName}_Part2.ifc`);

console.log('\n===================================================================');
console.log(' 🧩 ULTRA-HIGH-SCALE IFC PARTITIONER STARTED');
console.log('===================================================================');
console.log(` 📂 Source File     : ${inputPath}`);
console.log(` 📊 Total Size      : ${totalGB} GB (${(totalBytes / (1024 * 1024)).toFixed(1)} MB)`);
console.log(` 🛡️ Access Mode     : STRICT READ-ONLY`);
console.log(` 🎯 Target Outputs  :`);
console.log(`    - Part 1        : ${part1Path}`);
console.log(`    - Part 2        : ${part2Path}`);
console.log('===================================================================\n');

// 160 Million entity capacity bitset = 20 MB of RAM (eliminates V8 Map 16.7M limit)
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

const splitByteTarget = Math.floor(totalBytes / 2);
const idRegex = /^#(\d+)\s*=/;
const refRegex = /#(\d+)/g;

async function runSplit() {
  const startTime = Date.now();

  // -------------------------------------------------------------
  // PASS 1: Boundary Detection & Cross-Reference Mapping
  // -------------------------------------------------------------
  console.log('[Pass 1/2] Analyzing entity dependencies and split boundary...');

  const headerLines = [];
  let currentBytes = 0;
  let inDataSection = false;
  let splitReached = false;
  let splitEntityId = -1;
  let lastProgress = -1;
  let directRefCount = 0;

  const pass1Stream = fs.createReadStream(inputPath, {
    encoding: 'utf8',
    highWaterMark: 1024 * 1024 * 8, // 8 MB chunk buffer for maximum I/O speed
  });

  const rl1 = readline.createInterface({
    input: pass1Stream,
    crlfDelay: Infinity,
  });

  for await (const line of rl1) {
    const lineLen = Buffer.byteLength(line, 'utf8') + 1;
    currentBytes += lineLen;

    const pct = Math.min(Math.floor((currentBytes / totalBytes) * 100), 100);
    if (pct !== lastProgress && pct % 5 === 0) {
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

    // Check if we reached the ~50% byte mark
    if (!splitReached && currentBytes >= splitByteTarget) {
      splitReached = true;
      splitEntityId = id;
      console.log(`\n      📍 Split boundary found at Entity #${splitEntityId} (~${(currentBytes / (1024 * 1024 * 1024)).toFixed(2)} GB)`);
    }

    // In Part 2: track any references to entities defined in Part 1
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

  console.log(`\n      🔗 Total Part 1 entities needed by Part 2: ${directRefCount.toLocaleString()}`);

  // -------------------------------------------------------------
  // PASS 2: Streaming Generation of Part 1 and Part 2
  // -------------------------------------------------------------
  console.log('\n[Pass 2/2] Writing partitioned IFC files...');

  const part1Stream = fs.createWriteStream(part1Path, { encoding: 'utf8' });
  const part2Stream = fs.createWriteStream(part2Path, { encoding: 'utf8' });

  // Write shared header to both parts
  const headerContent = headerLines.join('\n') + '\n';
  part1Stream.write(headerContent);
  part2Stream.write(headerContent);

  const pass2Stream = fs.createReadStream(inputPath, {
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

    const pct = Math.min(Math.floor((currentBytes / totalBytes) * 100), 100);
    if (pct !== lastProgress && pct % 5 === 0) {
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
      // Part 1 content
      part1Stream.write(line + '\n');

      // Shared root foundation entities (units, contexts, project, site, building, styles)
      // plus any specific Part 1 entity required by Part 2
      if (id <= 50 || isNeeded(id)) {
        part2Stream.write(line + '\n');
      }
    } else {
      // Close Part 1 when boundary is reached
      if (!part1Closed) {
        part1Stream.write('ENDSEC;\nEND-ISO-10303-21;\n');
        part1Stream.end();
        part1Closed = true;
      }

      // Part 2 content
      part2Stream.write(line + '\n');
    }
  }

  // Finalize Part 2
  part2Stream.write('ENDSEC;\nEND-ISO-10303-21;\n');
  part2Stream.end();

  // Wait for both streams to flush to disk
  await Promise.all([
    new Promise((res) => part1Stream.on('finish', res)),
    new Promise((res) => part2Stream.on('finish', res)),
  ]);

  const totalTimeSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const part1SizeMB = (fs.statSync(part1Path).size / (1024 * 1024)).toFixed(1);
  const part2SizeMB = (fs.statSync(part2Path).size / (1024 * 1024)).toFixed(1);

  console.log('\n\n===================================================================');
  console.log(' ✅ PARTITION COMPLETED SUCCESSFULLY!');
  console.log('===================================================================');
  console.log(` ⏱️ Total Time Elapsed: ${totalTimeSec} seconds`);
  console.log(` 📄 Part 1 Generated  : ${part1Path} (${part1SizeMB} MB)`);
  console.log(` 📄 Part 2 Generated  : ${part2Path} (${part2SizeMB} MB)`);
  console.log('===================================================================');
  console.log('\n🚀 Next Steps: Convert both parts to .frag using:');
  console.log(`   1. npm run convert -- "${part1Path}"`);
  console.log(`   2. npm run convert -- "${part2Path}"`);
  console.log('\n💡 Then load both generated .frag files simultaneously into the viewer:');
  console.log('   - http://localhost:5173/\n');
}

runSplit().catch((err) => {
  console.error('\n❌ Split process failed with error:', err);
  process.exit(1);
});
