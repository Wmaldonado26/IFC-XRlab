export interface BackendHealth {
  online: boolean;
  version?: string;
  port?: number;
  freeMemoryGB?: number;
  totalMemoryGB?: number;
  activeJobs?: number;
}

export interface BackendConversionProgress {
  percent: number;
  stage: string;
  elapsed?: string;
}

export interface BackendConversionResult {
  parts: string[];
  fragmentBuffers: Uint8Array[];
  jobId: string;
  durationSec: string;
  totalSizeMB: string;
}

/**
 * Checks if local 64-bit microservice backend is active and available
 */
export async function checkBackendHealth(): Promise<BackendHealth> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch('/api/health', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return { online: false };
    }
    const data = await res.json();
    return {
      online: true,
      version: data.version,
      port: data.port,
      freeMemoryGB: data.freeMemoryGB,
      totalMemoryGB: data.totalMemoryGB,
      activeJobs: data.activeJobs,
    };
  } catch {
    clearTimeout(timeoutId);
    return { online: false };
  }
}

/**
 * Streams massive IFC file to local microservice, subscribes to SSE progress,
 * and retrieves generated .frag files.
 */
export async function convertIfcViaBackend(
  file: File,
  onProgress: (progress: BackendConversionProgress) => void
): Promise<BackendConversionResult> {
  onProgress({
    percent: 0,
    stage: 'Iniciando subida en streaming al microservicio local de 64 bits...',
  });

  const formData = new FormData();
  formData.append('file', file, file.name);

  // 1. Upload stream to backend
  const uploadResponse = await fetch('/api/convert', {
    method: 'POST',
    body: formData,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => 'Error al contactar el servidor');
    throw new Error(`Error en el microservicio (${uploadResponse.status}): ${errorText}`);
  }

  const { jobId, progressUrl } = await uploadResponse.json();

  // 2. Connect to Server-Sent Events (SSE)
  return new Promise<BackendConversionResult>((resolve, reject) => {
    const eventSource = new EventSource(progressUrl);

    eventSource.addEventListener('progress', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onProgress({
          percent: typeof data.percent === 'number' ? data.percent : 0,
          stage: data.stage || 'Procesando modelo...',
          elapsed: data.elapsed,
        });
      } catch (err) {
        console.error('Error parseando evento SSE de progreso:', err);
      }
    });

    eventSource.addEventListener('complete', async (e: MessageEvent) => {
      eventSource.close();
      try {
        const data = JSON.parse(e.data);
        const { parts, downloadUrls, totalSizeMB, durationSec } = data;

        onProgress({
          percent: 98,
          stage: 'Descargando partes optimizadas (.frag) a memoria GPU...',
        });

        const fragmentBuffers: Uint8Array[] = [];
        for (let i = 0; i < downloadUrls.length; i++) {
          const downloadUrl = downloadUrls[i];
          const partName = parts[i] || `Parte ${i + 1}`;
          onProgress({
            percent: 98,
            stage: `Transfiriendo ${partName} (${i + 1}/${downloadUrls.length})...`,
          });

          const resp = await fetch(downloadUrl);
          if (!resp.ok) {
            throw new Error(`Fallo al descargar fragmento desde ${downloadUrl}`);
          }
          const buf = await resp.arrayBuffer();
          fragmentBuffers.push(new Uint8Array(buf));
        }

        // 3. Immediately notify backend to clean up temp storage
        try {
          await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
        } catch (cleanupErr) {
          console.warn(`No se pudo eliminar el job ${jobId} en el backend:`, cleanupErr);
        }

        resolve({
          parts,
          fragmentBuffers,
          jobId,
          durationSec,
          totalSizeMB,
        });
      } catch (err) {
        reject(err);
      }
    });

    eventSource.addEventListener('error', (e: any) => {
      eventSource.close();
      let errorMsg = 'Error en el flujo de eventos del servidor';
      if (e?.data) {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed.error) errorMsg = parsed.error;
        } catch {
          errorMsg = String(e.data);
        }
      }
      reject(new Error(errorMsg));
    });

    eventSource.onerror = () => {
      // EventSource fires onerror when connection is closed or interrupted
      if (eventSource.readyState === EventSource.CLOSED) {
        // Closed normally or aborted
      }
    };
  });
}
