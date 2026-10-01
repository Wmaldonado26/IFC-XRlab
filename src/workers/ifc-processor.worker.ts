import * as FRAGS from '@thatopen/fragments';
import * as WEBIFC from 'web-ifc';

interface IFileReaderSync {
  readAsArrayBuffer(blob: Blob): ArrayBuffer;
  readAsBinaryString(blob: Blob): string;
  readAsText(blob: Blob, encoding?: string): string;
  readAsDataURL(blob: Blob): string;
}

declare const FileReaderSync: {
  prototype: IFileReaderSync;
  new (): IFileReaderSync;
};

// Ensure Web-IFC CreateSettings does not enforce artificial 2GB limit
const ifcApiProto = WEBIFC.IfcAPI.prototype as any;
const originalCreateSettings = ifcApiProto.CreateSettings;
if (originalCreateSettings) {
  ifcApiProto.CreateSettings = function (settings: any) {
    const s = originalCreateSettings.call(this, settings);
    // Default to 4 GB (4294901760 bytes), the full capacity of 32-bit WebAssembly linear memory
    s.MEMORY_LIMIT = settings?.MEMORY_LIMIT ?? 4294901760;
    return s;
  };
}

const ctx: any = self;

ctx.onmessage = async (e: MessageEvent) => {
  const { file, wasmPath } = e.data;

  if (!file) {
    ctx.postMessage({ type: 'error', error: 'No file provided' });
    return;
  }

  const fileName = (file as any).name || 'modelo.ifc';
  const fileSizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(2);
  const fileSizeBytes = file.size;

  console.log(`[IFC-Worker] Starting processing for "${fileName}"`);
  console.log(`[IFC-Worker] File size: ${fileSizeGB} GB (${fileSizeBytes} bytes)`);
  console.log(`[IFC-Worker] Memory mode: Streamed Chunk Reader (FileReaderSync Zero-Copy)`);
  console.log(`[IFC-Worker] WASM memory ceiling: 4096 MB`);

  try {
    const serializer = new FRAGS.IfcImporter();
    serializer.wasm = {
      absolute: true,
      path: wasmPath || '/',
    };

    // Synchronous chunked reader for Web Worker (zero pre-allocated ArrayBuffer)
    const reader = new FileReaderSync();
    const readCallback = (offset: number, size: number): Uint8Array => {
      const safeOffset = offset >>> 0;
      const slice = file.slice(safeOffset, safeOffset + size);
      const arrayBuffer = reader.readAsArrayBuffer(slice);
      return new Uint8Array(arrayBuffer);
    };

    // Use raw: true to eliminate redundant pako.deflate inside worker
    // and transfer direct FlatBuffer bytes to main thread with 0-copy.
    const fragmentBytes = await serializer.process({
      readFromCallback: true,
      readCallback,
      raw: true,
      progressCallback: (progress: number, detail?: any) => {
        ctx.postMessage({
          type: 'progress',
          progress: Math.min(Math.round(progress * 100), 100),
          detail,
        });
      },
    });

    const fragSizeMB = (fragmentBytes.byteLength / (1024 * 1024)).toFixed(2);
    console.log(`[IFC-Worker] Fragments generated successfully (raw zero-copy): ${fragSizeMB} MB`);
    console.log(`[IFC-Worker] Cleaning up temporary parser resources...`);

    // Clean serializer and internal memory
    (serializer as any).clean?.();

    // Transfer the generated ArrayBuffer using transferable objects (0-copy transfer)
    ctx.postMessage(
      {
        type: 'success',
        fragmentBytes,
        raw: true,
      },
      [fragmentBytes.buffer]
    );
  } catch (err: any) {
    console.error('[IFC-Worker] Processing failed:', err);
    ctx.postMessage({
      type: 'error',
      error: err?.message || String(err),
    });
  }
};
