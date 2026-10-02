import express, { type Request, type Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import busboy from 'busboy';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { jobQueue } from './queue.js';
import { serverLogger } from './logger.js';
import {
  initDatabase,
  verifyStorageIntegrity,
  resolveStoragePath,
  findModelByProjectAndPart,
  getAllModelsWithDetails,
  getModelDetail,
  getProject,
  getModelsForProject,
  createProject,
  updateProject,
  deleteProject,
  deleteModel,
  closeDatabase,
  getUserById,
  getUserByEmail,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  setAssignedProjectsForUser,
  getAssignedProjectIdsForUser,
  isProjectAssignedToUser,
  createSession,
  deleteSession,
  cleanupExpiredSessions,
  recordLoginAttempt,
  isLoginRateLimited,
  clearLoginAttempts,
  DB_PATH,
  STORAGE_DIR,
} from './db.js';
import {
  authMiddleware,
  requireAuth,
  requireAdmin,
  hashPassword,
  comparePassword,
  generateSessionToken,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  bootstrapAdminFromEnv,
} from './auth.js';

// 0. Initialize SQLite database & verify storage integrity on boot
initDatabase();
const integrity = verifyStorageIntegrity();
cleanupExpiredSessions();

// Attempt bootstrap admin from env if configured
bootstrapAdminFromEnv().catch((err) => {
  console.error('[Auth] Error during bootstrapAdminFromEnv:', err);
});

// Periodic session cleanup every 2 hours
const sessionCleanupInterval = setInterval(() => {
  try {
    cleanupExpiredSessions();
  } catch (err) {
    console.error('[Auth] Error in periodic session cleanup:', err);
  }
}, 2 * 60 * 60 * 1000);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Middlewares
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(authMiddleware);

// Helper for client IP
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

/* ===================================================================
 * 1. AUTHENTICATION ENDPOINTS
 * =================================================================== */

// 1a. POST /api/auth/login
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  const clientIp = getClientIp(req);

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ success: false, error: 'Correo electrónico y contraseña requeridos.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Rate limiting check
  if (isLoginRateLimited(clientIp)) {
    res.status(429).json({
      success: false,
      error: 'Demasiados intentos fallidos de inicio de sesión. Por favor espere 15 minutos antes de reintentar.',
    });
    return;
  }

  const user = getUserByEmail(normalizedEmail);
  if (!user || user.is_active !== 1) {
    recordLoginAttempt(clientIp, normalizedEmail);
    // Generic message to avoid username enumeration
    res.status(401).json({ success: false, error: 'Credenciales inválidas o cuenta desactivada.' });
    return;
  }

  const passwordValid = await comparePassword(password, user.password_hash);
  if (!passwordValid) {
    recordLoginAttempt(clientIp, normalizedEmail);
    res.status(401).json({ success: false, error: 'Credenciales inválidas o cuenta desactivada.' });
    return;
  }

  // Login successful
  clearLoginAttempts(clientIp);

  const token = generateSessionToken();
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  createSession(token, user.id, expiresAt);

  res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

  const assignedProjectIds = getAssignedProjectIdsForUser(user.id);

  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: Boolean(user.is_active),
      assignedProjectIds,
      createdAt: user.created_at,
    },
  });
});

// 1b. POST /api/auth/logout
app.post('/api/auth/logout', (req: Request, res: Response) => {
  if (req.sessionToken) {
    try {
      deleteSession(req.sessionToken);
    } catch (err) {
      console.error('[Auth] Error deleting session on logout:', err);
    }
  }

  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });

  res.json({ success: true, message: 'Sesión cerrada exitosamente.' });
});

// 1c. GET /api/auth/me (Returns active session status)
app.get('/api/auth/me', (req: Request, res: Response) => {
  if (!req.user) {
    res.json({
      authenticated: false,
      user: null,
    });
    return;
  }

  const assignedProjectIds = getAssignedProjectIdsForUser(req.user.id);

  res.json({
    authenticated: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      isActive: Boolean(req.user.is_active),
      assignedProjectIds,
      createdAt: req.user.created_at,
    },
  });
});

/* ===================================================================
 * 2. USER MANAGEMENT ENDPOINTS (Admin Only)
 * =================================================================== */

// 2a. GET /api/users
app.get('/api/users', requireAdmin, (req: Request, res: Response) => {
  const q = req.query.q ? String(req.query.q) : undefined;
  try {
    const users = getAllUsers(q);
    res.json({ status: 'ok', users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2b. POST /api/users (Create user)
app.post('/api/users', requireAdmin, async (req: Request, res: Response) => {
  const { name, email, password, role, isActive, assignedProjectIds } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'El nombre del usuario es obligatorio.' });
    return;
  }

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ error: 'Correo electrónico válido obligatorio.' });
    return;
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    return;
  }

  const userRole = role === 'admin' ? 'admin' : 'user';

  try {
    const existing = getUserByEmail(email);
    if (existing) {
      res.status(400).json({ error: 'Ya existe un usuario con este correo electrónico.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const newUser = createUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      role: userRole,
      isActive: isActive !== false,
    });

    if (Array.isArray(assignedProjectIds)) {
      setAssignedProjectsForUser(newUser.id, assignedProjectIds);
    }

    const assigned = getAssignedProjectIdsForUser(newUser.id);

    res.status(201).json({
      status: 'ok',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        isActive: Boolean(newUser.is_active),
        assignedProjectIds: assigned,
        assignedProjectsCount: assigned.length,
        createdAt: newUser.created_at,
        updatedAt: newUser.updated_at,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 2c. GET /api/users/:id
app.get('/api/users/:id', requireAdmin, (req: Request, res: Response) => {
  const id = String(req.params.id);
  const user = getUserById(id);
  if (!user) {
    res.status(404).json({ error: 'Usuario no encontrado.' });
    return;
  }
  const assigned = getAssignedProjectIdsForUser(user.id);
  res.json({
    status: 'ok',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: Boolean(user.is_active),
      assignedProjectIds: assigned,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    },
  });
});

// 2d. PATCH /api/users/:id
app.patch('/api/users/:id', requireAdmin, async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { name, email, password, role, isActive, assignedProjectIds } = req.body || {};

  try {
    let passwordHash: string | undefined;
    if (password) {
      if (typeof password !== 'string' || password.length < 8) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
        return;
      }
      passwordHash = await hashPassword(password);
    }

    const updated = updateUser(id, {
      name,
      email,
      passwordHash,
      role,
      isActive,
    });

    if (!updated) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    if (Array.isArray(assignedProjectIds)) {
      setAssignedProjectsForUser(id, assignedProjectIds);
    }

    const assigned = getAssignedProjectIdsForUser(id);

    res.json({
      status: 'ok',
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        isActive: Boolean(updated.is_active),
        assignedProjectIds: assigned,
        assignedProjectsCount: assigned.length,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 2e. DELETE /api/users/:id
app.delete('/api/users/:id', requireAdmin, (req: Request, res: Response) => {
  const id = String(req.params.id);

  if (req.user?.id === id) {
    res.status(400).json({ error: 'No puede eliminar su propia cuenta de usuario en sesión.' });
    return;
  }

  try {
    const deleted = deleteUser(id);
    if (!deleted) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }
    res.json({ success: true, message: 'Usuario eliminado exitosamente.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 2f. GET /api/users/:id/projects
app.get('/api/users/:id/projects', requireAdmin, (req: Request, res: Response) => {
  const id = String(req.params.id);
  const user = getUserById(id);
  if (!user) {
    res.status(404).json({ error: 'Usuario no encontrado.' });
    return;
  }
  const assigned = getAssignedProjectIdsForUser(id);
  res.json({ status: 'ok', assignedProjectIds: assigned });
});

// 2g. PUT /api/users/:id/projects
app.put('/api/users/:id/projects', requireAdmin, (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { projectIds } = req.body || {};

  if (!Array.isArray(projectIds)) {
    res.status(400).json({ error: 'El campo projectIds debe ser un array de identificadores.' });
    return;
  }

  const user = getUserById(id);
  if (!user) {
    res.status(404).json({ error: 'Usuario no encontrado.' });
    return;
  }

  try {
    setAssignedProjectsForUser(id, projectIds);
    res.json({ status: 'ok', assignedProjectIds: projectIds });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ===================================================================
 * 3. HEALTH & LOGS
 * =================================================================== */

// 3a. GET /api/health (Public)
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
    storage: {
      dbPath: DB_PATH,
      totalModels: integrity.totalModels,
      readyModels: integrity.readyCount,
      missingModels: integrity.missingCount,
    },
  });
});

// 3b. GET /api/logs (Admin Only)
app.get('/api/logs', requireAdmin, (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    logs: serverLogger.getLogs(),
  });
});

// 3c. DELETE /api/logs (Admin Only)
app.delete('/api/logs', requireAdmin, (_req: Request, res: Response) => {
  serverLogger.clear();
  res.json({ success: true, message: 'Logs del servidor limpiados' });
});

/* ===================================================================
 * 4. PROJECTS ENDPOINTS (Permission Aware)
 * =================================================================== */

// 4a. GET /api/projects
// Lists projects visible to the authenticated user. Admins see all; normal users only assigned.
app.get('/api/projects', requireAuth, (req: Request, res: Response) => {
  const q = req.query.q ? String(req.query.q) : undefined;
  const user = req.user!;
  const isAdmin = user.role === 'admin';

  res.json({
    status: 'ok',
    projects: jobQueue.listCompletedProjects(q, user.id, isAdmin),
  });
});

// 4b. POST /api/projects (Admin Only)
app.post('/api/projects', requireAdmin, (req: Request, res: Response) => {
  const { name, description } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'El nombre del proyecto es obligatorio.' });
    return;
  }

  try {
    const project = createProject(name, description);
    res.status(201).json({ status: 'ok', project });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 4c. GET /api/projects/:id (Requires assignment or admin)
app.get('/api/projects/:id', requireAuth, (req: Request, res: Response) => {
  const id = String(req.params.id);
  const user = req.user!;
  const isAdmin = user.role === 'admin';

  if (!isAdmin && !isProjectAssignedToUser(user.id, id)) {
    res.status(403).json({ error: 'Acceso denegado. No tiene permisos para consultar este proyecto.' });
    return;
  }

  const project = getProject(id);
  if (!project) {
    res.status(404).json({ error: `Proyecto con ID ${id} no encontrado en SQLite.` });
    return;
  }
  const models = getModelsForProject(id);
  res.json({
    status: 'ok',
    project: {
      ...project,
      models,
    },
  });
});

// 4d. PATCH/PUT /api/projects/:id (Admin Only)
const handleProjectUpdate = (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { name, description } = req.body || {};

  try {
    const updated = updateProject(id, { name, description });
    if (!updated) {
      res.status(404).json({ error: `Proyecto con ID ${id} no encontrado.` });
      return;
    }
    res.json({ status: 'ok', project: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};
app.patch('/api/projects/:id', requireAdmin, handleProjectUpdate);
app.put('/api/projects/:id', requireAdmin, handleProjectUpdate);

// 4e. DELETE /api/projects/:id (Admin Only)
app.delete('/api/projects/:id', requireAdmin, (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const result = deleteProject(id);
    res.json({
      success: true,
      message: `Proyecto ${id} y sus ${result.deletedModelsCount} modelo(s) eliminados exitosamente.`,
      deletedModelsCount: result.deletedModelsCount,
    });
  } catch (err: any) {
    const statusCode = err.message.includes('no encontrado') ? 404 : 500;
    res.status(statusCode).json({ error: err.message });
  }
});

/* ===================================================================
 * 5. MODELS ENDPOINTS (Permission Aware)
 * =================================================================== */

// 5a. GET /api/models (Lists models with row-level permission filtering)
app.get('/api/models', requireAuth, (req: Request, res: Response) => {
  const q = req.query.q ? String(req.query.q) : undefined;
  const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;
  const user = req.user!;
  const isAdmin = user.role === 'admin';

  // If normal user requests specific projectId, verify assignment
  if (!isAdmin && projectId && !isProjectAssignedToUser(user.id, projectId)) {
    res.status(403).json({ error: 'Acceso denegado a los modelos del proyecto solicitado.' });
    return;
  }

  res.json({
    status: 'ok',
    models: getAllModelsWithDetails(q, projectId, status, user.id, isAdmin),
  });
});

// 5b. GET /api/models/:id (Requires model's project assignment or admin)
app.get('/api/models/:id', requireAuth, (req: Request, res: Response) => {
  const id = String(req.params.id);
  const user = req.user!;
  const isAdmin = user.role === 'admin';

  const model = getModelDetail(id);
  if (!model) {
    res.status(404).json({ error: `Modelo con ID ${id} no encontrado.` });
    return;
  }

  if (!isAdmin && !isProjectAssignedToUser(user.id, model.projectId)) {
    res.status(403).json({ error: 'Acceso denegado al modelo solicitado.' });
    return;
  }

  res.json({ status: 'ok', model });
});

// 5c. DELETE /api/models/:id (Admin Only)
app.delete('/api/models/:id', requireAdmin, (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const result = deleteModel(id);
    res.json({
      success: true,
      message: `Modelo ${result.modelName} eliminado exitosamente.`,
      modelName: result.modelName,
      projectId: result.projectId,
    });
  } catch (err: any) {
    const statusCode = err.message.includes('no encontrado') ? 404 : 500;
    res.status(statusCode).json({ error: err.message });
  }
});

// 5d. GET /api/models/:id/download (Direct download with permission check)
app.get('/api/models/:id/download', requireAuth, (req: Request, res: Response) => {
  const id = String(req.params.id);
  const user = req.user!;
  const isAdmin = user.role === 'admin';

  const model = getModelDetail(id);
  if (!model) {
    res.status(404).json({ error: `Modelo con ID ${id} no encontrado.` });
    return;
  }

  if (!isAdmin && !isProjectAssignedToUser(user.id, model.projectId)) {
    res.status(403).json({ error: 'Acceso denegado. No tiene permisos para descargar modelos de este proyecto.' });
    return;
  }

  try {
    const filePath = resolveStoragePath(model.storagePath);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: `El archivo del modelo ${model.name} no existe en disco.` });
      return;
    }

    const stats = fs.statSync(filePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${model.name}"`);
    res.setHeader('Content-Length', stats.size);

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ===================================================================
 * 6. CONVERSION PIPELINE & PROGRESS (Admin / Authorized)
 * =================================================================== */

// 6a. POST /api/convert (Requires Admin authorization)
app.post('/api/convert', requireAdmin, (req: Request, res: Response) => {
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

// 6b. GET /api/jobs/:id/progress (Server-Sent Events, requires authentication)
app.get('/api/jobs/:id/progress', requireAuth, (req: Request, res: Response) => {
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

// 6c. GET /api/jobs/:id/download/:part (Streaming Fragment Download with authorization)
// Checks SQLite first for permanently persisted models, then falls back to in-memory/temp
app.get('/api/jobs/:id/download/:part', requireAuth, (req: Request, res: Response) => {
  const id = String(req.params.id);
  const part = String(req.params.part);
  const user = req.user!;
  const isAdmin = user.role === 'admin';

  // Strategy A: Check SQLite permanent storage
  const persistedModel = findModelByProjectAndPart(id, part);
  if (persistedModel) {
    // Check permission on project
    if (!isAdmin && !isProjectAssignedToUser(user.id, persistedModel.project_id)) {
      res.status(403).json({
        error: 'Acceso denegado. No tiene permisos para acceder a este modelo.',
      });
      return;
    }

    try {
      const filePath = resolveStoragePath(persistedModel.storage_path);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({
          error: `El archivo de fragmento ${persistedModel.name} no se encuentra en el almacenamiento permanente.`,
        });
        return;
      }

      const stats = fs.statSync(filePath);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${persistedModel.name}"`);
      res.setHeader('Content-Length', stats.size);

      const readStream = fs.createReadStream(filePath);
      readStream.pipe(res);
      return;
    } catch (err: any) {
      res.status(400).json({ error: err.message });
      return;
    }
  }

  // Strategy B: Fallback to temporary directory if job is still in scratch space
  if (!isAdmin) {
    // Normal users cannot access scratch jobs without assignment
    res.status(403).json({ error: 'Acceso denegado al recurso temporal.' });
    return;
  }

  const job = jobQueue.getJob(id);
  if (!job) {
    res.status(404).json({ error: `Tarea o modelo con ID ${id} no encontrado en el sistema.` });
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

  const tempFilePath = path.join(job.tempDir, partFileName);
  if (!fs.existsSync(tempFilePath)) {
    res.status(404).json({ error: `El archivo de fragmento ${partFileName} no existe en disco.` });
    return;
  }

  const stats = fs.statSync(tempFilePath);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${partFileName}"`);
  res.setHeader('Content-Length', stats.size);

  const readStream = fs.createReadStream(tempFilePath);
  readStream.pipe(res);
});

// 6d. DELETE /api/jobs/:id (Temporary Scratch Space Cleanup - Admin Only)
app.delete('/api/jobs/:id', requireAdmin, (req: Request, res: Response) => {
  const id = String(req.params.id);
  const deleted = jobQueue.deleteJob(id);

  if (!deleted) {
    res.json({
      success: true,
      message: `El almacenamiento temporal para la tarea ${id} ya estaba liberado.`,
    });
    return;
  }

  res.json({
    success: true,
    message: `Almacenamiento temporal para la tarea ${id} eliminado con éxito. Modelos persistentes protegidos.`,
  });
});

// Graceful shutdown
const handleShutdown = () => {
  console.log('\n🛑 Cerrando servidor y cerrando base de datos SQLite...');
  clearInterval(sessionCleanupInterval);
  jobQueue.destroy();
  closeDatabase();
  process.exit(0);
};

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

// Start Server
app.listen(PORT, () => {
  console.log('===================================================================');
  console.log(` 🚀 IFC-XRlab Local Microservice running on http://localhost:${PORT}`);
  console.log(` 🩺 Health Check : http://localhost:${PORT}/api/health`);
  console.log(` 🗄️ Database     : SQLite (${DB_PATH})`);
  console.log(` 💾 Storage Dir  : ${STORAGE_DIR}`);
  console.log(` 📦 Ready Models : ${integrity.readyCount} persistidos`);
  console.log(` ⚙️ Max Old Space : 16 GB heap configured`);
  console.log(` 💾 System Memory: ${(os.freemem() / (1024 * 1024 * 1024)).toFixed(2)} GB free / ${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(2)} GB total`);
  console.log('===================================================================');
});
