import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('[patch-dependencies] Starting patches to eliminate 2GB artificial limits...');

// 1. Patch web-ifc
const webIfcFiles = [
  'node_modules/web-ifc/web-ifc-api.js',
  'node_modules/web-ifc/web-ifc-api-node.js',
  'node_modules/web-ifc/web-ifc-api-iife.js',
];

for (const relPath of webIfcFiles) {
  const filePath = path.join(rootDir, relPath);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const initialContent = content;
    // Replace MEMORY_LIMIT: 2147483648 with 4294901760 (maximum WebAssembly heap limit)
    content = content.replaceAll('MEMORY_LIMIT: 2147483648', 'MEMORY_LIMIT: 4294901760');
    if (content !== initialContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`[patch-dependencies] Patched web-ifc in ${relPath}`);
    } else {
      console.log(`[patch-dependencies] Already patched or pattern not found in ${relPath}`);
    }
  }
}

// 2. Patch flatbuffers
const flatbuffersFiles = [
  'node_modules/flatbuffers/mjs/builder.js',
  'node_modules/flatbuffers/js/builder.js',
  'node_modules/flatbuffers/ts/builder.ts',
];

const fbPatternOld = `        if (old_buf_size & 0xC0000000) {
            throw new Error('FlatBuffers: cannot grow buffer beyond 2 gigabytes.');
        }
        const new_buf_size = old_buf_size << 1;`;

const fbPatternOldTS = `      // Ensure we don't grow beyond what fits in an int.
      if (old_buf_size & 0xC0000000) {
        throw new Error('FlatBuffers: cannot grow buffer beyond 2 gigabytes.');
      }
  
      const new_buf_size = old_buf_size << 1;`;

const fbReplacement = `        let new_buf_size;
        if (old_buf_size >= 1073741824) {
            new_buf_size = old_buf_size + 268435456;
        } else {
            new_buf_size = old_buf_size * 2;
        }
        if (new_buf_size > 4294901760) {
            throw new Error('FlatBuffers: cannot grow buffer beyond maximum addressable size.');
        }`;

for (const relPath of flatbuffersFiles) {
  const filePath = path.join(rootDir, relPath);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const initialContent = content;
    content = content.replace(fbPatternOld, fbReplacement);
    content = content.replace(fbPatternOldTS, fbReplacement);
    if (content !== initialContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`[patch-dependencies] Patched FlatBuffers in ${relPath}`);
    }
  }
}

// 3. Patch @thatopen/fragments
const fragmentsFiles = [
  'node_modules/@thatopen/fragments/dist/index.mjs',
  'node_modules/@thatopen/fragments/dist/index.cjs',
];

for (const relPath of fragmentsFiles) {
  const filePath = path.join(rootDir, relPath);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const initialContent = content;

    // Remove 2GB limit in bundled flatbuffers
    content = content.replaceAll(
      'if(e&3221225472)throw new Error("FlatBuffers: cannot grow buffer beyond 2 gigabytes.");let i=e<<1',
      'let i=e>=1073741824?e+268435456:e*2;if(i>4294901760)throw new Error("FlatBuffers: cannot grow buffer beyond maximum addressable size.");'
    );
    content = content.replaceAll(
      'if(t&3221225472)throw new Error("FlatBuffers: cannot grow buffer beyond 2 gigabytes.");let e=t<<1',
      'let e=t>=1073741824?t+268435456:t*2;if(e>4294901760)throw new Error("FlatBuffers: cannot grow buffer beyond maximum addressable size.");'
    );

    // Pass MEMORY_LIMIT: 4294901760 to web-ifc OpenModel calls
    content = content.replaceAll(
      'OpenModel(t.bytes,{COORDINATE_TO_ORIGIN:!0})',
      'OpenModel(t.bytes,{COORDINATE_TO_ORIGIN:!0,MEMORY_LIMIT:4294901760})'
    );
    content = content.replaceAll(
      'OpenModelFromCallback(t.readCallback,{COORDINATE_TO_ORIGIN:!0})',
      'OpenModelFromCallback(t.readCallback,{COORDINATE_TO_ORIGIN:!0,MEMORY_LIMIT:4294901760})'
    );

    if (content !== initialContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`[patch-dependencies] Patched @thatopen/fragments in ${relPath}`);
    }
  }
}

// 4. Patch @thatopen/components (remove 300 units maxDistance clamp for large models like ships)
const componentsFiles = [
  'node_modules/@thatopen/components/dist/index.mjs',
  'node_modules/@thatopen/components/dist/index.cjs',
];

for (const relPath of componentsFiles) {
  const filePath = path.join(rootDir, relPath);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    const initialContent = content;
    content = content.replaceAll('controls.maxDistance = 300;', 'controls.maxDistance = 10000000;');
    if (content !== initialContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`[patch-dependencies] Patched camera maxDistance in ${relPath}`);
    }
  }
}

console.log('[patch-dependencies] All patches applied successfully.');
