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
  onProgress: (progress: BackendConversionProgress) => void,
  projectId?: string
): Promise<BackendConversionResult> {
  onProgress({
    percent: 0,
    stage: 'Iniciando subida en streaming al microservicio local de 64 bits...',
  });

  const formData = new FormData();
  formData.append('file', file, file.name);
  if (projectId) {
    formData.append('projectId', projectId);
  }

  // 1. Upload stream to backend
  const url = projectId ? `/api/convert?projectId=${encodeURIComponent(projectId)}` : '/api/convert';
  const uploadResponse = await fetch(url, {
    method: 'POST',
    credentials: 'include',
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

          const resp = await fetch(downloadUrl, { credentials: 'include' });
          if (!resp.ok) {
            let detail = `HTTP ${resp.status}`;
            try {
              const errJson = await resp.json();
              if (errJson.error) detail += `: ${errJson.error}`;
            } catch {
              const errText = await resp.text().catch(() => '');
              if (errText) detail += `: ${errText}`;
            }
            throw new Error(`Fallo al descargar fragmento desde ${downloadUrl} (${detail})`);
          }
          const buf = await resp.arrayBuffer();
          fragmentBuffers.push(new Uint8Array(buf));
        }

        // 3. Immediately notify backend to clean up temp storage
        try {
          await fetch(`/api/jobs/${jobId}`, { method: 'DELETE', credentials: 'include' });
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

export interface BackendModelItem {
  id: string;
  projectId: string;
  projectName?: string;
  name: string;
  storagePath: string;
  sizeBytes: number;
  status: 'ready' | 'processing' | 'failed' | 'missing_file';
  fileExists: boolean;
  sizeFormatted: string;
  createdAt: number;
  updatedAt: number;
}

export interface BackendProject {
  id: string;
  name: string;
  fileName: string;
  description: string | null;
  createdAt: number;
  modelsCount: number;
  models: BackendModelItem[];
  parts: string[];
  fileSize: number;
  totalPartsSizeMB: string;
}

export async function fetchBackendProjects(query?: string): Promise<BackendProject[]> {
  try {
    const url = query ? `/api/projects?q=${encodeURIComponent(query)}` : '/api/projects';
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.projects || [];
  } catch (err) {
    console.warn('Error fetching backend projects:', err);
    return [];
  }
}

export async function fetchBackendProject(id: string): Promise<BackendProject> {
  const res = await fetch(`/api/projects/${id}`, { credentials: 'include' });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Error obteniendo proyecto (${res.status})`);
  }
  const data = await res.json();
  return data.project;
}

export async function createBackendProject(name: string, description?: string): Promise<BackendProject> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Error creando proyecto (${res.status})`);
  }
  const data = await res.json();
  return data.project;
}

export async function updateBackendProject(
  id: string,
  updates: { name?: string; description?: string }
): Promise<BackendProject> {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Error actualizando proyecto (${res.status})`);
  }
  const data = await res.json();
  return data.project;
}

export async function deleteBackendProject(id: string): Promise<{ success: boolean; deletedModelsCount: number }> {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Error eliminando proyecto (${res.status})`);
  }
  return res.json();
}

export async function fetchBackendModels(params?: {
  query?: string;
  projectId?: string;
  status?: string;
}): Promise<BackendModelItem[]> {
  try {
    const searchParams = new URLSearchParams();
    if (params?.query) searchParams.set('q', params.query);
    if (params?.projectId) searchParams.set('projectId', params.projectId);
    if (params?.status) searchParams.set('status', params.status);

    const qs = searchParams.toString();
    const url = qs ? `/api/models?${qs}` : '/api/models';
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.models || [];
  } catch (err) {
    console.warn('Error fetching backend models:', err);
    return [];
  }
}

export async function fetchBackendModelDetail(id: string): Promise<BackendModelItem> {
  const res = await fetch(`/api/models/${id}`, { credentials: 'include' });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Error obteniendo detalles del modelo (${res.status})`);
  }
  const data = await res.json();
  return data.model;
}

export async function deleteBackendModel(id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/models/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Error eliminando modelo (${res.status})`);
  }
  return res.json();
}

export async function downloadModelFragment(modelId: string): Promise<ArrayBuffer> {
  const res = await fetch(`/api/models/${modelId}/download`, { credentials: 'include' });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Error descargando archivo FRAG (${res.status})`);
  }
  return res.arrayBuffer();
}

export async function downloadBackendFragments(
  jobId: string,
  parts: string[],
  onProgress?: (loaded: number, total: number) => void
): Promise<ArrayBuffer[]> {
  const buffers: ArrayBuffer[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const res = await fetch(`/api/jobs/${jobId}/download/${part}`, { credentials: 'include' });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.error) detail += `: ${errJson.error}`;
      } catch {
        const errText = await res.text().catch(() => '');
        if (errText) detail += `: ${errText}`;
      }
      throw new Error(`Error descargando fragmento "${part}" del proyecto "${jobId}" (${detail})`);
    }
    const buf = await res.arrayBuffer();
    buffers.push(buf);
    onProgress?.(i + 1, parts.length);
  }
  return buffers;
}

/**
 * Directly uploads a pre-converted .frag file to a project without running conversion.
 * Validates, persists to storage/models/<projectId>/<modelId>/, and registers in SQLite.
 */
export async function uploadDirectFrag(
  projectId: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<BackendModelItem> {
  if (!file.name.toLowerCase().endsWith('.frag')) {
    throw new Error('Solo se admiten archivos con extensión .frag.');
  }

  return new Promise<BackendModelItem>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/projects/${encodeURIComponent(projectId)}/models/upload-frag`, true);
    xhr.withCredentials = true;

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      try {
        const response = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && response.model) {
          resolve(response.model);
        } else {
          reject(new Error(response.error || `Error del servidor (${xhr.status})`));
        }
      } catch (err: any) {
        reject(new Error(`Respuesta no válida del servidor (${xhr.status}): ${xhr.responseText || err.message}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Error de conexión de red durante la subida del archivo .frag.'));
    };

    const formData = new FormData();
    formData.append('file', file, file.name);
    xhr.send(formData);
  });
}


