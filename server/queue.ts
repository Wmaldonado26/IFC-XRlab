import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Job, ProgressEventData, CompleteEventData } from './types.js';
import { convertIfcJob } from './converter.js';

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

    // TTL Garbage Collector running every 5 minutes (clean jobs > 30 mins)
    this.ttlInterval = setInterval(() => {
      this.runGarbageCollector();
    }, 5 * 60 * 1000);
  }

  public getActiveJobsCount(): number {
    return this.activeJobId ? 1 : 0;
  }

  public createJob(fileName: string, fileSize: number): Job {
    const id = crypto.randomUUID();
    const tempDir = path.join(this.tempBaseDir, id);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const sourceFile = path.join(tempDir, 'source.ifc');

    const job: Job = {
      id,
      fileName,
      fileSize,
      status: 'uploading',
      createdAt: Date.now(),
      stage: 'Recibiendo archivo IFC en streaming...',
      percent: 0,
      parts: [],
      tempDir,
      sourceFile,
      subscribers: [],
    };

    this.jobs.set(id, job);
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

      job.status = 'completed';
      job.percent = 100;
      job.stage = 'Conversión completada con éxito';
      job.parts = parts;

      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      let totalBytes = 0;
      for (const part of parts) {
        const pPath = path.join(job.tempDir, part);
        if (fs.existsSync(pPath)) {
          totalBytes += fs.statSync(pPath).size;
        }
      }
      const totalSizeMB = (totalBytes / (1024 * 1024)).toFixed(2);

      const downloadUrls = parts.map((_, i) => `/api/jobs/${job.id}/download/${i + 1}`);

      const completeData: CompleteEventData = {
        parts,
        downloadUrls,
        totalSizeMB,
        durationSec,
      };

      console.log(`\n===================================================================`);
      console.log(` ✅ CONVERSIÓN FINALIZADA [Job ${job.id}]`);
      console.log(` ⏱️ Tiempo Total: ${durationSec}s | Partes: ${parts.length} | Tamaño FRAG: ${totalSizeMB} MB`);
      console.log(`===================================================================\n`);

      this.notifySubscribers(job, 'complete', completeData);
    } catch (err: any) {
      console.error(`\n❌ Error durante el procesamiento del Job ${job.id}:`, err);
      job.status = 'failed';
      job.error = err?.message || 'Fallo desconocido en el motor de conversión';
      this.notifySubscribers(job, 'error', { error: job.error });
    } finally {
      this.activeJobId = null;
      this.processNext();
    }
  }

  public deleteJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    // Delete temp folder
    try {
      if (fs.existsSync(job.tempDir)) {
        fs.rmSync(job.tempDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`Error al eliminar directorio temporal para job ${id}:`, err);
    }

    this.jobs.delete(id);
    console.log(`🧹 Job ${id} eliminado y almacenamiento temporal liberado.`);
    return true;
  }

  public listCompletedProjects(): Array<{
    id: string;
    fileName: string;
    fileSize: number;
    parts: string[];
    createdAt: number;
    totalPartsSizeMB: string;
  }> {
    const list: Array<{
      id: string;
      fileName: string;
      fileSize: number;
      parts: string[];
      createdAt: number;
      totalPartsSizeMB: string;
    }> = [];

    for (const job of this.jobs.values()) {
      if (job.status === 'completed' && job.parts.length > 0) {
        let totalBytes = 0;
        for (const p of job.parts) {
          const filePath = path.join(job.tempDir, p);
          if (fs.existsSync(filePath)) {
            totalBytes += fs.statSync(filePath).size;
          }
        }
        list.push({
          id: job.id,
          fileName: job.fileName,
          fileSize: job.fileSize,
          parts: job.parts,
          createdAt: job.createdAt,
          totalPartsSizeMB: (totalBytes / (1024 * 1024)).toFixed(2),
        });
      }
    }
    return list;
  }

  private runGarbageCollector(): void {
    const now = Date.now();
    const TTL_MS = 30 * 60 * 1000; // 30 minutes

    for (const [id, job] of this.jobs.entries()) {
      if (now - job.createdAt > TTL_MS) {
        console.log(`⏳ TTL expirado para Job ${id}. Limpiando recursos...`);
        this.deleteJob(id);
      }
    }

    // Also clean any orphaned folders in temp/
    try {
      if (fs.existsSync(this.tempBaseDir)) {
        const folders = fs.readdirSync(this.tempBaseDir);
        for (const folder of folders) {
          const folderPath = path.join(this.tempBaseDir, folder);
          const fStats = fs.statSync(folderPath);
          if (fStats.isDirectory() && now - fStats.mtimeMs > TTL_MS) {
            fs.rmSync(folderPath, { recursive: true, force: true });
            console.log(`🧹 Carpeta temporal huérfana eliminada: ${folder}`);
          }
        }
      }
    } catch (err) {
      console.error('Error durante la recolección de basura TTL:', err);
    }
  }

  public destroy(): void {
    clearInterval(this.ttlInterval);
  }
}

export const jobQueue = new JobQueue();
