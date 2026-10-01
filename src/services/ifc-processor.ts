import * as FRAGS from '@thatopen/fragments';
import * as WEBIFC from 'web-ifc';
import IfcWorker from '../workers/ifc-processor.worker.ts?worker';

export interface IfcProcessOptions {
  wasmPath?: string;
  raw?: boolean;
  onProgress?: (progress: number, detail?: any) => void;
}

// Runtime monkey-patch to ensure Web-IFC CreateSettings never falls back to artificial 2GB limit
const ifcApiProto = WEBIFC.IfcAPI.prototype as any;
const originalCreateSettings = ifcApiProto?.CreateSettings;
if (originalCreateSettings) {
  ifcApiProto.CreateSettings = function (settings: any) {
    const s = originalCreateSettings.call(this, settings);
    // Raise artificial 2GB ceiling (2147483648) to 4GB (4294901760), the full capacity of 32-bit WebAssembly
    s.MEMORY_LIMIT = settings?.MEMORY_LIMIT ?? 4294901760;
    return s;
  };
}

export function downloadFragmentFile(bytes: Uint8Array, fileName: string) {
  const cleanName = fileName.replace(/\.ifc$/i, '').replace(/\.frag$/i, '') + '.frag';
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cleanName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const MAX_SAFE_BROWSER_IFC_SIZE = 1.85 * 1024 * 1024 * 1024; // 1.85 GB (WASM32 linear memory ceiling)

export class MassiveIfcFileError extends Error {
  fileName: string;
  fileSizeBytes: number;
  fileSizeGB: string;

  constructor(file: File) {
    const fileSizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(2);
    const message = `El archivo "${file.name}" (${fileSizeGB} GB) supera el límite físico de memoria WebAssembly de 32 bits en navegadores (~1.85 GB). Para procesar modelos masivos de esta escala sin fragmentación corrupta, ejecuta en tu terminal: npm run convert -- "${file.name}". Esto generará los archivos .frag optimizados para carga instantánea.`;
    super(message);
    this.name = 'MassiveIfcFileError';
    this.fileName = file.name;
    this.fileSizeBytes = file.size;
    this.fileSizeGB = fileSizeGB;
  }
}

/**
 * Memory-optimized IFC file processor.
 * 
 * Uses a dedicated Web Worker with FileReaderSync streaming (zero-copy)
 * and 4096 MB WASM linear memory ceiling.
 * 
 * For massive files (> 1.85 GB, like complete ships or large industrial complexes),
 * 32-bit WebAssembly linear memory cannot address the internal syntax tree.
 * Those files must be pre-converted using the CLI pipeline (`npm run convert`).
 */
export async function processIfcFile(
  file: File,
  options: IfcProcessOptions = {}
): Promise<Uint8Array> {
  const fileSizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(2);
  const wasmPath = options.wasmPath || '/';

  console.log(`[IFC] File size: ${fileSizeGB} GB (${file.size} bytes)`);
  console.log(`[IFC] Starting processing for "${file.name}"...`);

  // Detect massive files that exceed browser wasm32 addressable memory
  if (file.size > MAX_SAFE_BROWSER_IFC_SIZE) {
    throw new MassiveIfcFileError(file);
  }

  // Single-pass processing for models <= 1.85 GB via dedicated worker
  if (typeof Worker !== 'undefined') {
    return await processViaWorker(file, wasmPath, options.onProgress);
  }

  return await processOnMainThread(file, wasmPath, options.onProgress);
}

function processViaWorker(
  file: Blob | File,
  wasmPath: string,
  onProgress?: (progress: number, detail?: any) => void
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    console.log('[IFC] Processing mode: Dedicated Web Worker with Streamed FileReaderSync');
    console.log('[IFC] WASM memory ceiling: 4096 MB');

    const worker = new IfcWorker();

    worker.onmessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data) return;

      if (data.type === 'progress') {
        if (onProgress) {
          onProgress(data.progress, data.detail);
        }
      } else if (data.type === 'success') {
        const fragmentBytes = data.fragmentBytes instanceof Uint8Array 
          ? data.fragmentBytes 
          : new Uint8Array(data.fragmentBytes);
        const fragMB = (fragmentBytes.byteLength / (1024 * 1024)).toFixed(2);
        console.log(`[IFC] Fragments generated (Zero-Copy): ${fragMB} MB`);
        console.log('[IFC] Temporary buffers released');
        worker.terminate();
        resolve(fragmentBytes);
      } else if (data.type === 'error') {
        worker.terminate();
        reject(new Error(data.error || 'IFC Worker processing failed'));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };

    // Post File/Blob object (zero-copy clone of file handle)
    worker.postMessage({ file, wasmPath });
  });
}

async function processOnMainThread(
  file: File,
  wasmPath: string,
  onProgress?: (progress: number, detail?: any) => void
): Promise<Uint8Array> {
  console.log('[IFC] Processing mode: Direct Main Thread (Memory Managed)');
  console.log('[IFC] WASM memory ceiling: 4096 MB');

  const serializer = new FRAGS.IfcImporter();
  serializer.wasm = {
    absolute: true,
    path: wasmPath,
  };

  let buffer: ArrayBuffer | null = await file.arrayBuffer();
  let ifcBytes: Uint8Array | null = new Uint8Array(buffer);

  try {
    const fragmentBytes = await serializer.process({
      bytes: ifcBytes,
      raw: true,
      progressCallback: (progress: number, detail?: any) => {
        if (onProgress) {
          onProgress(Math.min(Math.round(progress * 100), 100), detail);
        }
      },
    });

    const fragMB = (fragmentBytes.byteLength / (1024 * 1024)).toFixed(2);
    console.log(`[IFC] Fragments generated: ${fragMB} MB`);
    return fragmentBytes;
  } finally {
    // Explicitly release source buffers from memory immediately
    ifcBytes = null;
    buffer = null;
    (serializer as any).clean?.();
    console.log('[IFC] Temporary buffers released');
  }
}
