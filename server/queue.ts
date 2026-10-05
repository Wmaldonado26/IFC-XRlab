import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Job, CompleteEventData } from './types.js';
import { convertIfcJob } from './converter.js';
import {
  insertProject,
  insertConversionJob,
  updateConversionJob,
  persistJobArtifacts,
  listProjectsWithModels,
  type CompletedProjectSummary,
} from './db.js';

class JobQueue {
  private jobs = new Map<string, Job>();
  private queue: string[] = [];
  private activeJobId: string | null = null;
  private tempBaseDir: string;
  private ttlInterval: NodeJS.Timeout;

  constructor() {
    this.tempBaseDir = path.resolve(process.cwd(), 'temp');
    if (!fs.existsSync(this.tempBaseDir)) {
      fs.mkdirSync(this.tempBaseDir, { recursive: true });
    }

    // TTL Garbage Collector running every 5 minutes (cleans temporary scratch folders > 30 mins)
    // Note: Does NOT delete persisted models in storage/ or SQLite records.
    this.ttlInterval = setInterval(() => {
      this.runGarbageCollector();
    }, 5 * 60 * 1000);
  }

  public getActiveJobsCount(): number {
    return this.activeJobId ? 1 : 0;
  }

  public createJob(fileName: string, fileSize: number, targetProjectId?: string): Job {
    const id = crypto.randomUUID();
    const tempDir = path.join(this.tempBaseDir, id);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const sourceFile = path.join(tempDir, 'source.ifc');
    const now = Date.now();
    const effectiveProjectId = targetProjectId || id;

    const job: Job = {
      id,
      fileName,
      fileSize,
      status: 'uploading',
      createdAt: now,
      stage: 'Recibiendo archivo IFC en streaming...',
      percent: 0,
      parts: [],
      tempDir,
      sourceFile,
      subscribers: [],
      targetProjectId: effectiveProjectId,
    };

    this.jobs.set(id, job);

    // Initialize records in SQLite
    try {
      if (!targetProjectId) {
        insertProject(id, fileName, now);
      }
      insertConversionJob(id, effectiveProjectId, 'uploading', 0);
    } catch (dbErr) {
      console.error(`Error registrando nuevo job ${id} en SQLite:`, dbErr);
    }

    return job;
  }

  public getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  public enqueueJob(id: string): void {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = 'queued';
    job.stage = 'En cola: esperando turno de procesamiento...';

    try {
      updateConversionJob(id, { status: 'queued', progress: 0 });
    } catch (dbErr) {
      console.error(`Error actualizando estado en SQLite para job ${id}:`, dbErr);
    }

    this.notifySubscribers(job, 'progress', {
      percent: 0,
      stage: job.stage,
    });

    this.queue.push(id);
    this.processNext();
  }

  public subscribe(
    id: string,
    callback: (event: 'progress' | 'complete' | 'error', data: any) => void
  ): () => void {
    const job = this.jobs.get(id);
    if (!job) {
      throw new Error(`Tarea con ID ${id} no encontrada`);
    }

    job.subscribers.push(callback);

    // Send immediate current state
    if (job.status === 'completed') {
      const downloadUrls = job.parts.map((_, i) => `/api/jobs/${job.id}/download/${i + 1}`);
      callback('complete', {
        parts: job.parts,
        downloadUrls,
        totalSizeMB: '0',
        durationSec: '0',
      });
    } else if (job.status === 'failed') {
      callback('error', { error: job.error || 'Error desconocido' });
    } else {
      callback('progress', {
        percent: job.percent,
        stage: job.stage,
        elapsed: job.elapsed,
      });
    }

    return () => {
      job.subscribers = job.subscribers.filter((s) => s !== callback);
    };
  }

  private notifySubscribers(
    job: Job,
    event: 'progress' | 'complete' | 'error',
    data: any
  ): void {
    job.subscribers.forEach((subscriber) => {
      try {
        subscriber(event, data);
      } catch (err) {
        console.error(`Error enviando evento a suscriptor de job ${job.id}:`, err);
      }
    });
  }

  private async processNext(): Promise<void> {
    if (this.activeJobId !== null || this.queue.length === 0) {
      return;
    }

    const nextId = this.queue.shift();
    if (!nextId) return;

    const job = this.jobs.get(nextId);
    if (!job) {
      this.processNext();
      return;
    }

    this.activeJobId = job.id;
    job.status = 'processing';
    const startTime = Date.now();

    try {
      updateConversionJob(job.id, { status: 'processing', progress: 0 });
    } catch (dbErr) {
      console.error(`Error actualizando inicio de procesamiento en SQLite para job ${job.id}:`, dbErr);
    }

    console.log(`\n===================================================================`);
    console.log(` ⚙️ INICIANDO PROCESO DE CONVERSIÓN [Job ${job.id}]`);
    console.log(` 📄 Archivo: ${job.fileName} (${(job.fileSize / (1024 * 1024)).toFixed(2)} MB)`);
    console.log(`===================================================================\n`);

    try {
      const parts = await convertIfcJob(job, (percent, stage, elapsed) => {
        job.percent = percent;
        job.stage = stage;
        job.elapsed = elapsed;
        this.notifySubscribers(job, 'progress', {
          percent,
          stage,
          elapsed,
        });
      });

      console.log(`\n💾 Persistiendo artefactos FRAG en almacenamiento local definitivo...`);

      // Atomically persist FRAG files into storage/models/ and SQLite
      const persistedModels = persistJobArtifacts(
        job.id,
        job.fileName,
        job.tempDir,
        parts,
        crypto.randomUUID,
        job.targetProjectId
      );

      // Verify that all models were persisted before declaring success
      if (persistedModels.length !== parts.length) {
        throw new Error(`Inconsistencia en persistencia: ${persistedModels.length} de ${parts.length} partes guardadas.`);
      }

      job.status = 'completed';
      job.percent = 100;
      job.stage = 'Conversión y persistencia completadas con éxito';
      job.parts = parts;

      // Preservar archivos de fragmentos (.frag) en temp para acceso directo
      // (No se eliminan para permitir streaming y acceso instantáneo)

      // Safe cleanup of temporary IFC source file if still present
      if (fs.existsSync(job.sourceFile)) {
        try {
          fs.unlinkSync(job.sourceFile);
        } catch {
          // non-fatal
        }
      }

      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      const totalBytes = persistedModels.reduce((acc, m) => acc + m.size_bytes, 0);
      const totalSizeMB = (totalBytes / (1024 * 1024)).toFixed(2);

      const downloadUrls = parts.map((_, i) => `/api/jobs/${job.id}/download/${i + 1}`);

      const completeData: CompleteEventData = {
        parts,
        downloadUrls,
        totalSizeMB,
        durationSec,
      };

      console.log(`\n===================================================================`);
      console.log(` ✅ CONVERSIÓN Y ALMACENAMIENTO FINALIZADOS [Job ${job.id}]`);
      console.log(` ⏱️ Tiempo Total: ${durationSec}s | Partes: ${parts.length} | Tamaño FRAG: ${totalSizeMB} MB`);
      console.log(` 🗄️ Metadatos y rutas relativas consolidados en SQLite (ifc-xrlab.db)`);
      console.log(`===================================================================\n`);

      this.notifySubscribers(job, 'complete', completeData);
    } catch (err: any) {
      console.error(`\n❌ Error durante el procesamiento del Job ${job.id}:`, err);
      job.status = 'failed';
      job.error = err?.message || 'Fallo desconocido en el motor de conversión o persistencia';

      try {
        updateConversionJob(job.id, {
          status: 'failed',
          error_message: job.error,
        });
      } catch (dbErr) {
        console.error(`Error actualizando fallo en SQLite para job ${job.id}:`, dbErr);
      }

      // Crucial: Temporary files in job.tempDir are NOT deleted so data can be recovered
      this.notifySubscribers(job, 'error', { error: job.error });
    } finally {
      this.activeJobId = null;
      this.processNext();
    }
  }

  /**
   * Cleans up temporary upload/scratch folder for a job.
   * Does NOT touch persisted files in storage/models/ or SQLite records.
   */
  public deleteJob(id: string): boolean {
    const job = this.jobs.get(id);

    // If job is in memory, delete its temp directory
    if (job) {
      try {
        if (fs.existsSync(job.tempDir)) {
          fs.rmSync(job.tempDir, { recursive: true, force: true });
        }
      } catch (err) {
        console.error(`Error al eliminar directorio temporal para job ${id}:`, err);
      }

      this.jobs.delete(id);
      console.log(`🧹 Almacenamiento temporal para job ${id} liberado. Modelos persistentes seguros en SQLite.`);
      return true;
    }

    // If not in memory, check if a temp directory exists for this id
    const orphanTempDir = path.join(this.tempBaseDir, id);
    if (fs.existsSync(orphanTempDir)) {
      try {
        fs.rmSync(orphanTempDir, { recursive: true, force: true });
        console.log(`🧹 Directorio temporal huérfano liberado: ${orphanTempDir}`);
        return true;
      } catch (err) {
        console.error(`Error eliminando directorio temporal huérfano ${orphanTempDir}:`, err);
      }
    }

    return false;
  }

  /**
   * Retrieves completed projects directly from SQLite, validating physical disk availability.
   * Reconstructed seamlessly even after Node.js restarts.
   */
  public listCompletedProjects(searchQuery?: string, userId?: string, isAdmin?: boolean): CompletedProjectSummary[] {
    try {
      return listProjectsWithModels(searchQuery, userId, isAdmin);
    } catch (err) {
      console.error('Error consultando proyectos persistidos desde SQLite:', err);
      return [];
    }
  }

  private runGarbageCollector(): void {
    const now = Date.now();
    const TTL_MS = 30 * 60 * 1000; // 30 minutes

    for (const [id, job] of this.jobs.entries()) {
      if (now - job.createdAt > TTL_MS) {
        console.log(`⏳ TTL temporal expirado para Job ${id}. Limpiando archivos temporales de scratch...`);
        this.deleteJob(id);
      }
    }

    // Clean orphaned folders in temp/ (only temporary scratch space)
    try {
      if (fs.existsSync(this.tempBaseDir)) {
        const folders = fs.readdirSync(this.tempBaseDir);
        for (const folder of folders) {
          // Proteger permanentemente la carpeta models y los archivos de modelo en temp/
          if (folder === 'models' || folder.toLowerCase().endsWith('.frag') || folder.toLowerCase().endsWith('.ifc')) {
            continue;
          }
          const folderPath = path.join(this.tempBaseDir, folder);
          const fStats = fs.statSync(folderPath);
          if (fStats.isDirectory() && now - fStats.mtimeMs > TTL_MS) {
            fs.rmSync(folderPath, { recursive: true, force: true });
            console.log(`🧹 Carpeta temporal huérfana eliminada: ${folder}`);
          }
        }
      }
    } catch (err) {
      console.error('Error durante la recolección de basura TTL en temp/:', err);
    }
  }

  public destroy(): void {
    clearInterval(this.ttlInterval);
  }
}

export const jobQueue = new JobQueue();
