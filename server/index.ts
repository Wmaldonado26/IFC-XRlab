import express, { type Request, type Response } from 'express';
import cors from 'cors';
import busboy from 'busboy';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { jobQueue } from './queue.js';
import { serverLogger } from './logger.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// 1. GET /api/health
app.get('/api/health', (_req: Request, res: Response) => {
  const freeBytes = os.freemem();
  const totalBytes = os.totalmem();
  const freeMemoryGB = parseFloat((freeBytes / (1024 * 1024 * 1024)).toFixed(2));
  const totalMemoryGB = parseFloat((totalBytes / (1024 * 1024 * 1024)).toFixed(2));

  res.json({
    status: 'ok',
    version: '1.0.0',
    port: PORT,
    freeMemoryGB,
    totalMemoryGB,
    activeJobs: jobQueue.getActiveJobsCount(),
  });
});

// 1b. GET /api/logs
app.get('/api/logs', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    logs: serverLogger.getLogs(),
  });
});

// 1c. DELETE /api/logs
app.delete('/api/logs', (_req: Request, res: Response) => {
  serverLogger.clear();
  res.json({ success: true, message: 'Logs del servidor limpiados' });
});

// 2. POST /api/convert (Streaming Upload with Busboy)
app.post('/api/convert', (req: Request, res: Response) => {
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('multipart/form-data')) {
    res.status(400).json({ error: 'La petición debe ser de tipo multipart/form-data.' });
    return;
  }

  let bb: ReturnType<typeof busboy>;
  try {
    bb = busboy({ headers: req.headers });
  } catch (err: any) {
    res.status(400).json({ error: `Cabeceras multipart no válidas: ${err.message}` });
    return;
  }

  let currentJob: ReturnType<typeof jobQueue.createJob> | null = null;
  let fileWritePromise: Promise<void> | null = null;

  bb.on('file', (_name, fileStream, info) => {
    const { filename } = info;
    const estSize = req.headers['content-length'] ? parseInt(req.headers['content-length'], 10) : 0;
    const job = jobQueue.createJob(filename || 'model.ifc', estSize);
    currentJob = job;

    console.log(`\n📥 Recibiendo archivo IFC por streaming: ${job.fileName} [Job ${job.id}]`);

    const writeStream = fs.createWriteStream(job.sourceFile);
    fileWritePromise = new Promise<void>((resolve, reject) => {
      fileStream.pipe(writeStream);
      writeStream.on('finish', () => {
        try {
          const actualSize = fs.statSync(job.sourceFile).size;
          job.fileSize = actualSize;
          console.log(`📥 Archivo IFC guardado en disco: ${(actualSize / (1024 * 1024)).toFixed(2)} MB`);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      writeStream.on('error', reject);
      fileStream.on('error', reject);
    });
  });

  bb.on('close', async () => {
    if (!currentJob) {
      res.status(400).json({ error: 'No se encontró ningún archivo IFC en la petición.' });
      return;
    }

    try {
      if (fileWritePromise) {
        await fileWritePromise;
      }

      jobQueue.enqueueJob(currentJob.id);

      res.status(202).json({
        jobId: currentJob.id,
        fileName: currentJob.fileName,
        fileSize: currentJob.fileSize,
        progressUrl: `/api/jobs/${currentJob.id}/progress`,
      });
    } catch (err: any) {
      console.error(`Error guardando archivo para job ${currentJob.id}:`, err);
      res.status(500).json({ error: `Fallo al escribir en disco el archivo IFC: ${err.message}` });
    }
  });

  bb.on('error', (err: any) => {
    console.error('Error en busboy durante la recepción:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: `Error procesando el flujo multipart: ${err.message}` });
    }
  });

  req.pipe(bb);
});

// 3. GET /api/jobs/:id/progress (Server-Sent Events)
app.get('/api/jobs/:id/progress', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const job = jobQueue.getJob(id);

  if (!job) {
    res.status(404).json({ error: `Tarea con ID ${id} no encontrada.` });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send heartbeat every 5 seconds to keep connection alive
  const heartbeatTimer = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 5000);

  let unsubscribe: () => void;

  try {
    unsubscribe = jobQueue.subscribe(id, (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (event === 'complete' || event === 'error') {
        clearInterval(heartbeatTimer);
        res.end();
      }
    });
  } catch (err: any) {
    clearInterval(heartbeatTimer);
    res.status(500).json({ error: err.message });
    return;
  }

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    if (unsubscribe) {
      unsubscribe();
    }
  });
});

// 4. GET /api/jobs/:id/download/:part (Streaming Fragment Download)
app.get('/api/jobs/:id/download/:part', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const part = String(req.params.part);
  const job = jobQueue.getJob(id);

  if (!job) {
    res.status(404).json({ error: `Tarea con ID ${id} no encontrada.` });
    return;
  }

  let partFileName = '';
  const partIndex = parseInt(part, 10);
  if (!isNaN(partIndex) && partIndex >= 1 && partIndex <= job.parts.length) {
    partFileName = job.parts[partIndex - 1];
  } else if (job.parts.includes(part)) {
    partFileName = part;
  } else {
    res.status(404).json({
      error: `Parte ${part} no encontrada. Partes disponibles: ${job.parts.join(', ')}`,
    });
    return;
  }

  const filePath = path.join(job.tempDir, partFileName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: `El archivo de fragmento ${partFileName} no existe en disco.` });
    return;
  }

  const stats = fs.statSync(filePath);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${partFileName}"`);
  res.setHeader('Content-Length', stats.size);

  const readStream = fs.createReadStream(filePath);
  readStream.pipe(res);
});

// 5. DELETE /api/jobs/:id (Immediate Resource Cleanup)
app.delete('/api/jobs/:id', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const deleted = jobQueue.deleteJob(id);

  if (!deleted) {
    res.status(404).json({ error: `Tarea con ID ${id} no encontrada o ya eliminada.` });
    return;
  }

  res.json({
    success: true,
    message: `Recursos y almacenamiento temporal para la tarea ${id} eliminados con éxito.`,
  });
});

// Start Server
app.listen(PORT, () => {
  console.log('===================================================================');
  console.log(` 🚀 IFC-XRlab Local Microservice running on http://localhost:${PORT}`);
  console.log(` 🩺 Health Check : http://localhost:${PORT}/api/health`);
  console.log(` ⚙️ Max Old Space : 16 GB heap configured`);
  console.log(` 💾 System Memory: ${(os.freemem() / (1024 * 1024 * 1024)).toFixed(2)} GB free / ${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(2)} GB total`);
  console.log('===================================================================');
});
