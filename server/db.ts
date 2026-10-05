import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '..');
export const TEMP_DIR = path.resolve(ROOT_DIR, 'temp');
export const TEMP_MODELS_DIR = path.resolve(TEMP_DIR, 'models');
export const STORAGE_DIR = path.resolve(ROOT_DIR, 'storage');
export const MODELS_DIR = path.resolve(STORAGE_DIR, 'models');
export const DB_PATH = path.resolve(STORAGE_DIR, 'ifc-xrlab.db');

export type UserRole = 'admin' | 'user';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  assignedProjectIds: string[];
  assignedProjectsCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  created_at: number;
}

export interface ModelRecord {
  id: string;
  project_id: string;
  name: string;
  storage_path: string;
  size_bytes: number;
  status: 'ready' | 'processing' | 'failed' | 'missing_file';
  created_at: number;
  updated_at: number;
}

export interface ModelItemDetail {
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

export interface ConversionJobRecord {
  id: string;
  project_id: string | null;
  model_id: string | null;
  status: 'queued' | 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  error_message: string | null;
  parts_json?: string | null;
  created_at: number;
  updated_at: number;
}

export interface ProjectCatalogSummary {
  id: string;
  name: string;
  fileName: string; // for backward compatibility with ViewerCo / ProjectsModal
  description: string | null;
  createdAt: number;
  modelsCount: number;
  models: ModelItemDetail[];
  parts: string[]; // for backward compatibility
  fileSize: number;
  totalPartsSizeMB: string;
}

export type CompletedProjectSummary = ProjectCatalogSummary;

/**
 * Formats a byte number into human-readable units (B, KB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Validates that an identifier only contains alphanumeric characters, underscores, hyphens, and dots.
 * Prevents directory traversal attacks.
 */
export function isValidId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[a-zA-Z0-9_\-.]+$/.test(id);
}

/**
 * Resolves a model relative path to an absolute path, verifying
 * that it exists within TEMP_DIR or STORAGE_DIR boundaries.
 */
export function resolveStoragePath(relativePath: string): string {
  if (!relativePath || typeof relativePath !== 'string') {
    throw new Error('Ruta de almacenamiento no válida.');
  }

  const normalizedRel = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const normalizedRoot = path.resolve(ROOT_DIR);

  // 1. Direct path from ROOT_DIR if relativePath starts with temp/ or storage/
  if (normalizedRel.startsWith('temp/') || normalizedRel.startsWith('storage/')) {
    const candidate = path.resolve(ROOT_DIR, normalizedRel);
    if ((candidate.startsWith(normalizedRoot + path.sep) || candidate === normalizedRoot) && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 2. Check directly under TEMP_DIR
  const tempRelCandidate = path.resolve(TEMP_DIR, normalizedRel.replace(/^temp\//, ''));
  if (fs.existsSync(tempRelCandidate)) {
    return tempRelCandidate;
  }

  // 3. Check under TEMP_MODELS_DIR
  const tempModelsCandidate = path.resolve(TEMP_MODELS_DIR, normalizedRel.replace(/^(temp\/)?(models\/)?/, ''));
  if (fs.existsSync(tempModelsCandidate)) {
    return tempModelsCandidate;
  }

  // 4. Check by filename in TEMP_DIR
  const basenameCandidate = path.resolve(TEMP_DIR, path.basename(normalizedRel));
  if (fs.existsSync(basenameCandidate)) {
    return basenameCandidate;
  }

  // 5. Check under STORAGE_DIR
  const storageRel = normalizedRel.replace(/^storage\//, '');
  const storageCandidate = path.resolve(STORAGE_DIR, storageRel);
  if (fs.existsSync(storageCandidate)) {
    return storageCandidate;
  }

  // 6. Fallback resolving under ROOT_DIR or STORAGE_DIR
  if (normalizedRel.startsWith('temp/')) {
    const candidate = path.resolve(ROOT_DIR, normalizedRel);
    if (candidate.startsWith(normalizedRoot + path.sep) || candidate === normalizedRoot) {
      return candidate;
    }
  }

  const defaultStorage = path.resolve(STORAGE_DIR, storageRel);
  const normalizedStorage = path.resolve(STORAGE_DIR);
  if (!defaultStorage.startsWith(normalizedStorage + path.sep) && defaultStorage !== normalizedStorage) {
    throw new Error(`Acceso denegado: intento de path traversal detectado (${relativePath})`);
  }

  return defaultStorage;
}

let dbInstance: DatabaseSync | null = null;

/**
 * Retrieves or initializes the SQLite database connection singleton.
 */
export function getDb(): DatabaseSync {
  if (!dbInstance) {
    initDatabase();
  }
  return dbInstance!;
}

/**
 * Idempotently initializes the SQLite database, schema, migrations, and storage directories.
 */
export function initDatabase(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  if (!fs.existsSync(TEMP_MODELS_DIR)) {
    fs.mkdirSync(TEMP_MODELS_DIR, { recursive: true });
  }

  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }

  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  const db = new DatabaseSync(DB_PATH);

  // Performance and referential integrity PRAGMAs
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  // Core entities
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversion_jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      model_id TEXT REFERENCES models(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_assignments (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      assigned_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, project_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      ip TEXT NOT NULL,
      email TEXT NOT NULL,
      attempt_time INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_models_project_id ON models(project_id);
    CREATE INDEX IF NOT EXISTS idx_models_status ON models(status);
    CREATE INDEX IF NOT EXISTS idx_conversion_jobs_project_id ON conversion_jobs(project_id);
    CREATE INDEX IF NOT EXISTS idx_conversion_jobs_status ON conversion_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_project_assignments_user_id ON project_assignments(user_id);
    CREATE INDEX IF NOT EXISTS idx_project_assignments_project_id ON project_assignments(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip, attempt_time);
  `);

  // Idempotent migration: add description column to projects if not present
  try {
    const tableInfo = db.prepare('PRAGMA table_info(projects)').all() as any[];
    if (!tableInfo.some((col: any) => col.name === 'description')) {
      db.exec('ALTER TABLE projects ADD COLUMN description TEXT;');
    }
  } catch (migErr) {
    console.warn('Nota sobre migración de esquema en tabla projects:', migErr);
  }

  // Idempotent migration: add parts_json column to conversion_jobs if not present
  try {
    const jobCols = db.prepare('PRAGMA table_info(conversion_jobs)').all() as any[];
    if (!jobCols.some((col: any) => col.name === 'parts_json')) {
      db.exec('ALTER TABLE conversion_jobs ADD COLUMN parts_json TEXT;');
    }
  } catch (migErr) {
    console.warn('Nota sobre migración de esquema en tabla conversion_jobs:', migErr);
  }

  // Ensure default admin user exists for local usage
  try {
    const adminRow = db.prepare("SELECT count(*) as count FROM users WHERE role = 'admin' AND is_active = 1").get() as any;
    if (!adminRow || Number(adminRow.count) === 0) {
      const now = Date.now();
      const hash = '$2a$12$e8yvRk3lTqIu/F6hZ1s43OpW2z5hXy8c3u9.rE31fW2gXoPq8gC2u';
      db.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, is_active, created_at, updated_at)
        VALUES ('admin-default-id', 'Administrador Principal', 'admin@ifcxrlab.local', ?, 'admin', 1, ?, ?)
        ON CONFLICT(email) DO UPDATE SET role = 'admin', is_active = 1
      `).run(hash, now, now);
      console.log('✓ [Database] Usuario administrador asegurado en SQLite (admin@ifcxrlab.local).');
    }
  } catch (adminErr) {
    console.warn('Nota asegurando administrador por defecto:', adminErr);
  }

  dbInstance = db;
  return db;
}

/**
 * Verifies the integrity of persistent files recorded in SQLite.
 * Checks for missing files on disk and flags them, ensuring the catalog is accurate.
 */
export function verifyStorageIntegrity(): { totalModels: number; readyCount: number; missingCount: number } {
  const db = getDb();
  const stmt = db.prepare('SELECT id, project_id, name, storage_path, status FROM models');
  const rows = stmt.all() as unknown as ModelRecord[];

  let readyCount = 0;
  let missingCount = 0;

  const updateStatusStmt = db.prepare('UPDATE models SET status = ?, updated_at = ? WHERE id = ?');

  for (const model of rows) {
    try {
      const fullPath = resolveStoragePath(model.storage_path);
      const exists = fs.existsSync(fullPath);

      if (exists) {
        if (model.status !== 'ready') {
          updateStatusStmt.run('ready', Date.now(), model.id);
        }
        readyCount++;
      } else {
        if (model.status === 'ready') {
          console.warn(`⚠️ [Storage Integrity] Archivo de modelo faltante en disco: ${model.storage_path} (ID: ${model.id})`);
          updateStatusStmt.run('missing_file', Date.now(), model.id);
        }
        missingCount++;
      }
    } catch (err: any) {
      console.error(`Error verificando modelo ${model.id}:`, err);
      missingCount++;
    }
  }

  // Check for orphan directories in storage/models that are not in SQLite
  try {
    if (fs.existsSync(MODELS_DIR)) {
      const projectDirs = fs.readdirSync(MODELS_DIR);
      for (const pDir of projectDirs) {
        const checkProjStmt = db.prepare('SELECT id FROM projects WHERE id = ?');
        const projRow = checkProjStmt.get(pDir);
        if (!projRow) {
          console.warn(`⚠️ [Storage Integrity] Directorio huérfano en disco sin registro de proyecto en SQLite: storage/models/${pDir}`);
        }
      }
    }
  } catch (err: any) {
    console.warn('Advertencia escaneando directorios huérfanos:', err);
  }

  return { totalModels: rows.length, readyCount, missingCount };
}

/* ===================================================================
 * USER MANAGEMENT & ROLES
 * =================================================================== */

export function createUser(
  nameOrOptions: string | { name: string; email: string; passwordHash: string; role?: UserRole; isActive?: boolean | number },
  email?: string,
  passwordHash?: string,
  role: UserRole = 'user',
  isActive: boolean | number = 1
): UserRecord {
  let nameVal: string;
  let emailVal: string;
  let hashVal: string;
  let roleVal: UserRole = role;
  let activeVal: number = typeof isActive === 'boolean' ? (isActive ? 1 : 0) : Number(isActive);

  if (typeof nameOrOptions === 'object' && nameOrOptions !== null) {
    nameVal = nameOrOptions.name;
    emailVal = nameOrOptions.email;
    hashVal = nameOrOptions.passwordHash;
    if (nameOrOptions.role) roleVal = nameOrOptions.role;
    if (nameOrOptions.isActive !== undefined) {
      activeVal = typeof nameOrOptions.isActive === 'boolean' ? (nameOrOptions.isActive ? 1 : 0) : Number(nameOrOptions.isActive);
    }
  } else {
    nameVal = nameOrOptions;
    emailVal = email || '';
    hashVal = passwordHash || '';
  }

  const trimmedName = (nameVal || '').trim();
  const trimmedEmail = (emailVal || '').trim().toLowerCase();

  if (!trimmedName) throw new Error('El nombre de usuario es obligatorio.');
  if (!trimmedEmail) throw new Error('El correo electrónico es obligatorio.');
  if (!hashVal) throw new Error('El hash de contraseña es obligatorio.');
  if (roleVal !== 'admin' && roleVal !== 'user') throw new Error('Rol no válido.');

  const db = getDb();
  const existing = getUserByEmail(trimmedEmail);
  if (existing) {
    throw new Error('Ya existe un usuario con este correo electrónico.');
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, trimmedName, trimmedEmail, hashVal, roleVal, activeVal ? 1 : 0, now, now);

  return {
    id,
    name: trimmedName,
    email: trimmedEmail,
    password_hash: hashVal,
    role: roleVal,
    is_active: activeVal ? 1 : 0,
    created_at: now,
    updated_at: now,
  };
}

export function getUserById(id: string): UserRecord | null {
  if (!isValidId(id)) return null;
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  const row = stmt.get(id);
  return (row as unknown as UserRecord) || null;
}

export function getUserByEmail(email: string): UserRecord | null {
  if (!email) return null;
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM users WHERE lower(email) = ?');
  const row = stmt.get(email.trim().toLowerCase());
  return (row as unknown as UserRecord) || null;
}

export function getActiveAdminCount(): number {
  const db = getDb();
  const stmt = db.prepare("SELECT count(*) as count FROM users WHERE role = 'admin' AND is_active = 1");
  const row = stmt.get() as any;
  return row ? Number(row.count) : 0;
}

export function getAllUsers(searchQuery?: string): UserSummary[] {
  const db = getDb();
  const query = (searchQuery || '').trim().toLowerCase();

  let sql = 'SELECT id, name, email, role, is_active, created_at, updated_at FROM users';
  const params: any[] = [];

  if (query) {
    sql += ' WHERE lower(name) LIKE ? OR lower(email) LIKE ?';
    const pattern = `%${query}%`;
    params.push(pattern, pattern);
  }

  sql += ' ORDER BY created_at DESC';

  const stmt = db.prepare(sql);
  const rows = (params.length > 0 ? stmt.all(...params) : stmt.all()) as any[];

  // Retrieve assigned project IDs for each user
  const assignStmt = db.prepare('SELECT project_id FROM project_assignments WHERE user_id = ?');

  return rows.map((u) => {
    const assignments = assignStmt.all(u.id) as Array<{ project_id: string }>;
    const assignedProjectIds = assignments.map((a) => a.project_id);

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as UserRole,
      isActive: Boolean(u.is_active),
      assignedProjectIds,
      assignedProjectsCount: assignedProjectIds.length,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
    };
  });
}

export function updateUser(
  id: string,
  updates: {
    name?: string;
    email?: string;
    passwordHash?: string;
    role?: UserRole;
    isActive?: boolean;
  }
): UserRecord | null {
  const existing = getUserById(id);
  if (!existing) return null;

  // Safeguard: Do not deactivate or demote the last active admin!
  if (existing.role === 'admin' && existing.is_active === 1) {
    const isDemoting = updates.role && updates.role !== 'admin';
    const isDeactivating = updates.isActive === false;

    if (isDemoting || isDeactivating) {
      const activeAdmins = getActiveAdminCount();
      if (activeAdmins <= 1) {
        throw new Error('No es posible desactivar o cambiar el rol del único administrador activo del sistema.');
      }
    }
  }

  const name = updates.name !== undefined ? updates.name.trim() : existing.name;
  let email = updates.email !== undefined ? updates.email.trim().toLowerCase() : existing.email;
  const passwordHash = updates.passwordHash !== undefined ? updates.passwordHash : existing.password_hash;
  const role = updates.role !== undefined ? updates.role : existing.role;
  const isActive = updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : existing.is_active;

  if (!name) throw new Error('El nombre de usuario no puede estar vacío.');
  if (!email) throw new Error('El correo electrónico no puede estar vacío.');

  const db = getDb();
  if (email !== existing.email) {
    const checkEmail = getUserByEmail(email);
    if (checkEmail && checkEmail.id !== id) {
      throw new Error('Ya existe otro usuario con este correo electrónico.');
    }
  }

  const now = Date.now();
  const stmt = db.prepare(`
    UPDATE users
    SET name = ?, email = ?, password_hash = ?, role = ?, is_active = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(name, email, passwordHash, role, isActive, now, id);

  return {
    id,
    name,
    email,
    password_hash: passwordHash,
    role,
    is_active: isActive,
    created_at: existing.created_at,
    updated_at: now,
  };
}

export function deleteUser(id: string): boolean {
  const existing = getUserById(id);
  if (!existing) return false;

  // Safeguard: Do not delete the last active admin!
  if (existing.role === 'admin') {
    const activeAdmins = getActiveAdminCount();
    if (activeAdmins <= 1) {
      throw new Error('No se puede eliminar el único administrador del sistema.');
    }
  }

  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    db.exec('COMMIT');
    console.log(`🗑️ [Auth] Usuario ${id} (${existing.email}) eliminado.`);
    return true;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

/* ===================================================================
 * PROJECT ASSIGNMENTS & PERMISSIONS
 * =================================================================== */

export function assignProjectToUser(userId: string, projectId: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO project_assignments (user_id, project_id, assigned_at)
    VALUES (?, ?, ?)
  `);
  stmt.run(userId, projectId, Date.now());
}

export function unassignProjectFromUser(userId: string, projectId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM project_assignments WHERE user_id = ? AND project_id = ?').run(userId, projectId);
}

export function setAssignedProjectsForUser(userId: string, projectIds: string[]): void {
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM project_assignments WHERE user_id = ?').run(userId);
    const insertStmt = db.prepare(`
      INSERT INTO project_assignments (user_id, project_id, assigned_at)
      VALUES (?, ?, ?)
    `);
    const now = Date.now();
    for (const pid of projectIds) {
      if (isValidId(pid)) {
        insertStmt.run(userId, pid, now);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

export function getAssignedProjectIdsForUser(userId: string): string[] {
  const db = getDb();
  const stmt = db.prepare('SELECT project_id FROM project_assignments WHERE user_id = ?');
  const rows = stmt.all(userId) as Array<{ project_id: string }>;
  return rows.map((r) => r.project_id);
}

export function isProjectAssignedToUser(userId: string, projectId: string): boolean {
  const db = getDb();
  const stmt = db.prepare('SELECT 1 FROM project_assignments WHERE user_id = ? AND project_id = ?');
  const row = stmt.get(userId, projectId);
  return Boolean(row);
}

/* ===================================================================
 * SESSIONS & RATE LIMITING
 * =================================================================== */

export function createSession(token: string, userId: string, expiresAt: number): void {
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(token, userId, expiresAt, now);
}

export function getSessionWithUser(token: string): { user: UserRecord; expires_at: number } | null {
  if (!token) return null;
  const db = getDb();
  const now = Date.now();

  const stmt = db.prepare(`
    SELECT s.expires_at, u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > ? AND u.is_active = 1
  `);
  const row = stmt.get(token, now) as any;
  if (!row) return null;

  return {
    expires_at: row.expires_at,
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      password_hash: row.password_hash,
      role: row.role as UserRole,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
  };
}

export function deleteSession(token: string): void {
  if (!token) return;
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(token);
}

export function deleteUserSessions(userId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function cleanupExpiredSessions(): void {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
}

export function recordLoginAttempt(ip: string, email: string): void {
  const db = getDb();
  db.prepare('INSERT INTO login_attempts (ip, email, attempt_time) VALUES (?, ?, ?)').run(
    ip,
    email.trim().toLowerCase(),
    Date.now()
  );
}

export function isLoginRateLimited(ip: string): boolean {
  const db = getDb();
  const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
  const stmt = db.prepare('SELECT count(*) as count FROM login_attempts WHERE ip = ? AND attempt_time > ?');
  const row = stmt.get(ip, fifteenMinutesAgo) as any;
  return row && Number(row.count) >= 5;
}

export function clearLoginAttempts(ip: string): void {
  const db = getDb();
  db.prepare('DELETE FROM login_attempts WHERE ip = ?').run(ip);
}

/* ===================================================================
 * PROJECTS CRUD & QUERIES (WITH USER PERMISSION FILTERING)
 * =================================================================== */

export function insertProject(id: string, name: string, createdAt: number, description: string | null = null): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO projects (id, name, description, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET 
      name = excluded.name,
      description = coalesce(excluded.description, projects.description)
  `);
  stmt.run(id, name, description, createdAt);
}

export function createProject(name: string, description: string | null = null): ProjectRecord {
  const trimmedName = (name || '').trim();
  if (!trimmedName) {
    throw new Error('El nombre del proyecto es obligatorio.');
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const trimmedDesc = description && description.trim() ? description.trim() : null;

  insertProject(id, trimmedName, now, trimmedDesc);

  return {
    id,
    name: trimmedName,
    description: trimmedDesc,
    created_at: now,
  };
}

export function updateProject(
  id: string,
  updates: { name?: string; description?: string }
): ProjectRecord | null {
  if (!isValidId(id)) {
    throw new Error(`ID de proyecto no válido: ${id}`);
  }

  const existing = getProject(id);
  if (!existing) return null;

  const newName = updates.name !== undefined ? updates.name.trim() : existing.name;
  if (!newName) {
    throw new Error('El nombre del proyecto no puede estar vacío.');
  }

  const newDesc = updates.description !== undefined ? (updates.description?.trim() || null) : existing.description;

  const db = getDb();
  const stmt = db.prepare('UPDATE projects SET name = ?, description = ? WHERE id = ?');
  stmt.run(newName, newDesc, id);

  return {
    id,
    name: newName,
    description: newDesc,
    created_at: existing.created_at,
  };
}

export function getProject(id: string): ProjectRecord | null {
  const db = getDb();
  const stmt = db.prepare('SELECT id, name, description, created_at FROM projects WHERE id = ?');
  const row = stmt.get(id);
  return (row as unknown as ProjectRecord) || null;
}

export function listProjectsWithModels(
  searchQuery?: string,
  userId?: string,
  isAdmin = false
): ProjectCatalogSummary[] {
  const db = getDb();
  const query = (searchQuery || '').trim().toLowerCase();

  let sql = `
    SELECT 
      p.id,
      p.name,
      p.description,
      p.created_at,
      m.id AS model_id,
      m.name AS model_name,
      m.size_bytes,
      m.storage_path,
      m.status AS model_status,
      m.created_at AS model_created_at,
      m.updated_at AS model_updated_at
    FROM projects p
    LEFT JOIN models m ON m.project_id = p.id
    WHERE 1=1
  `;

  const params: any[] = [];

  // Permission filtering: normal users can ONLY see projects assigned to them
  if (!isAdmin && userId) {
    sql += ` AND p.id IN (SELECT project_id FROM project_assignments WHERE user_id = ?)`;
    params.push(userId);
  }

  if (query) {
    sql += ` AND (lower(p.name) LIKE ? OR lower(coalesce(p.description, '')) LIKE ?)`;
    const searchPattern = `%${query}%`;
    params.push(searchPattern, searchPattern);
  }

  sql += ` ORDER BY p.created_at DESC, m.name ASC`;

  const stmt = db.prepare(sql);
  const rows = (params.length > 0 ? stmt.all(...params) : stmt.all()) as Array<{
    id: string;
    name: string;
    description: string | null;
    created_at: number;
    model_id: string | null;
    model_name: string | null;
    size_bytes: number | null;
    storage_path: string | null;
    model_status: string | null;
    model_created_at: number | null;
    model_updated_at: number | null;
  }>;

  const projectMap = new Map<string, ProjectCatalogSummary>();

  for (const row of rows) {
    let proj = projectMap.get(row.id);
    if (!proj) {
      proj = {
        id: row.id,
        name: row.name,
        fileName: row.name,
        description: row.description,
        createdAt: row.created_at,
        modelsCount: 0,
        models: [],
        parts: [],
        fileSize: 0,
        totalPartsSizeMB: '0.00',
      };
      projectMap.set(row.id, proj);
    }

    if (row.model_id && row.model_name && row.storage_path) {
      let fileExists = false;
      try {
        const fullPath = resolveStoragePath(row.storage_path);
        fileExists = fs.existsSync(fullPath);
      } catch {
        fileExists = false;
      }

      const sizeBytes = row.size_bytes || 0;
      const modelDetail: ModelItemDetail = {
        id: row.model_id,
        projectId: row.id,
        projectName: row.name,
        name: row.model_name,
        storagePath: row.storage_path,
        sizeBytes,
        status: (row.model_status as any) || (fileExists ? 'ready' : 'missing_file'),
        fileExists,
        sizeFormatted: formatBytes(sizeBytes),
        createdAt: row.model_created_at || row.created_at,
        updatedAt: row.model_updated_at || row.created_at,
      };

      proj.models.push(modelDetail);
      proj.modelsCount++;
      proj.parts.push(row.model_name);
      proj.fileSize += sizeBytes;
      proj.totalPartsSizeMB = (proj.fileSize / (1024 * 1024)).toFixed(2);
    }
  }

  return Array.from(projectMap.values());
}

/* ===================================================================
 * MODELS QUERIES (WITH USER PERMISSION FILTERING)
 * =================================================================== */

export function getModelsForProject(projectId: string): ModelRecord[] {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM models WHERE project_id = ? AND status = 'ready' ORDER BY name ASC");
  return (stmt.all(projectId) as unknown as ModelRecord[]) || [];
}

export function getModelById(modelId: string): ModelRecord | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM models WHERE id = ?');
  const row = stmt.get(modelId);
  return (row as unknown as ModelRecord) || null;
}

export function getAllModels(): ModelRecord[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM models ORDER BY created_at DESC');
  return (stmt.all() as unknown as ModelRecord[]) || [];
}

export function getAllModelsWithDetails(
  searchQuery?: string,
  projectId?: string,
  statusFilter?: string,
  userId?: string,
  isAdmin = false
): ModelItemDetail[] {
  const db = getDb();
  let sql = `
    SELECT 
      m.id,
      m.project_id,
      p.name AS project_name,
      m.name,
      m.storage_path,
      m.size_bytes,
      m.status,
      m.created_at,
      m.updated_at
    FROM models m
    JOIN projects p ON p.id = m.project_id
    WHERE 1=1
  `;

  const params: any[] = [];

  // Permission filtering: normal users can ONLY see models of projects assigned to them
  if (!isAdmin && userId) {
    sql += ` AND m.project_id IN (SELECT project_id FROM project_assignments WHERE user_id = ?)`;
    params.push(userId);
  }

  const query = (searchQuery || '').trim().toLowerCase();

  if (query) {
    sql += ` AND (lower(m.name) LIKE ? OR lower(p.name) LIKE ?)`;
    const pattern = `%${query}%`;
    params.push(pattern, pattern);
  }

  if (projectId && projectId !== 'all') {
    sql += ` AND m.project_id = ?`;
    params.push(projectId);
  }

  if (statusFilter && statusFilter !== 'all') {
    sql += ` AND m.status = ?`;
    params.push(statusFilter);
  }

  sql += ` ORDER BY m.created_at DESC`;

  const stmt = db.prepare(sql);
  const rows = (params.length > 0 ? stmt.all(...params) : stmt.all()) as any[];

  return rows.map((r) => {
    let fileExists = false;
    try {
      const fullPath = resolveStoragePath(r.storage_path);
      fileExists = fs.existsSync(fullPath);
    } catch {
      fileExists = false;
    }

    return {
      id: r.id,
      projectId: r.project_id,
      projectName: r.project_name,
      name: r.name,
      storagePath: r.storage_path,
      sizeBytes: r.size_bytes,
      status: r.status,
      fileExists,
      sizeFormatted: formatBytes(r.size_bytes),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

export function getModelDetail(modelId: string): ModelItemDetail | null {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 
      m.id,
      m.project_id,
      p.name AS project_name,
      m.name,
      m.storage_path,
      m.size_bytes,
      m.status,
      m.created_at,
      m.updated_at
    FROM models m
    JOIN projects p ON p.id = m.project_id
    WHERE m.id = ?
  `);
  const r = stmt.get(modelId) as any;
  if (!r) return null;

  let fileExists = false;
  try {
    const fullPath = resolveStoragePath(r.storage_path);
    fileExists = fs.existsSync(fullPath);
  } catch {
    fileExists = false;
  }

  return {
    id: r.id,
    projectId: r.project_id,
    projectName: r.project_name,
    name: r.name,
    storagePath: r.storage_path,
    sizeBytes: r.size_bytes,
    status: r.status,
    fileExists,
    sizeFormatted: formatBytes(r.size_bytes),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Controlled deletion of an individual model and its physical FRAG file.
 */
export function deleteModel(modelId: string): { success: boolean; modelName: string; projectId: string } {
  if (!isValidId(modelId)) {
    throw new Error('ID de modelo no válido.');
  }

  const db = getDb();
  const model = getModelById(modelId);
  if (!model) {
    throw new Error(`Modelo con ID ${modelId} no encontrado.`);
  }

  // 1. Delete physical file if no other model references the same storage path
  try {
    const fullPath = resolveStoragePath(model.storage_path);
    const sharedStmt = db.prepare('SELECT count(*) as count FROM models WHERE storage_path = ? AND id != ?');
    const sharedRow = sharedStmt.get(model.storage_path, modelId) as any;

    if (!sharedRow || sharedRow.count === 0) {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(`🗑️ [Storage] Archivo físico eliminado: ${fullPath}`);
      }
      // Remove parent model directory if empty
      const parentDir = path.dirname(fullPath);
      if (fs.existsSync(parentDir) && fs.readdirSync(parentDir).length === 0) {
        fs.rmdirSync(parentDir);
      }
    }
  } catch (fileErr) {
    console.warn(`Advertencia al eliminar archivo físico para modelo ${modelId}:`, fileErr);
  }

  // 2. Delete record from SQLite
  db.prepare('DELETE FROM models WHERE id = ?').run(modelId);
  console.log(`🗑️ [SQLite] Registro de modelo ${modelId} ("${model.name}") eliminado.`);

  return {
    success: true,
    modelName: model.name,
    projectId: model.project_id,
  };
}

/**
 * Finds a model by project ID or job ID and part identifier (part name e.g. "modelo_Part1.frag", model ID, or 1-based index).
 */
export function findModelByProjectAndPart(
  projectIdOrJobId: string,
  partIdentifier: string
): ModelRecord | null {
  const db = getDb();

  // 1. Direct match: is partIdentifier a model ID?
  if (isValidId(partIdentifier)) {
    const directModel = getModelById(partIdentifier);
    if (directModel) return directModel;
  }

  // 2. Direct match: is projectIdOrJobId a model ID?
  if (isValidId(projectIdOrJobId)) {
    const directModel = getModelById(projectIdOrJobId);
    if (directModel) return directModel;
  }

  // 3. Resolve effective project ID and any job-specific parts
  let effectiveProjectId = projectIdOrJobId;
  const jobRecord = getConversionJob(projectIdOrJobId);
  let jobParts: string[] = [];

  if (jobRecord) {
    if (jobRecord.project_id) {
      effectiveProjectId = jobRecord.project_id;
    }
    if (jobRecord.parts_json) {
      try {
        const parsed = JSON.parse(jobRecord.parts_json);
        if (Array.isArray(parsed)) jobParts = parsed;
      } catch {}
    }
  }

  // 4. Check if partIdentifier is a 1-based index (e.g. "1", "2")
  const partIndex = parseInt(partIdentifier, 10);
  if (!isNaN(partIndex) && partIndex >= 1) {
    // If we have job-specific parts recorded from conversion
    if (jobParts.length >= partIndex) {
      const specificPartName = jobParts[partIndex - 1];
      const stmt = db.prepare("SELECT * FROM models WHERE project_id = ? AND name = ? AND status = 'ready'");
      const row = stmt.get(effectiveProjectId, specificPartName) as any;
      if (row) return row as ModelRecord;
    }

    // If partIndex is 1 and job has a primary model_id
    if (partIndex === 1 && jobRecord?.model_id) {
      const primaryModel = getModelById(jobRecord.model_id);
      if (primaryModel) return primaryModel;
    }

    // Fallback: by 1-based index in the project models
    const projectModels = getModelsForProject(effectiveProjectId);
    if (projectModels.length >= partIndex) {
      return projectModels[partIndex - 1];
    }
  }

  // 5. Match by filename within the project
  const byNameStmt = db.prepare("SELECT * FROM models WHERE project_id = ? AND (name = ? OR id = ?) AND status = 'ready'");
  const modelByName = byNameStmt.get(effectiveProjectId, partIdentifier, partIdentifier) as any;
  if (modelByName) return modelByName as ModelRecord;

  // 6. Global match by model name across the database if unique
  const globalByName = db.prepare("SELECT * FROM models WHERE name = ? AND status = 'ready'").get(partIdentifier) as any;
  if (globalByName) return globalByName as ModelRecord;

  return null;
}

/* ===================================================================
 * CONVERSION JOBS CRUD
 * =================================================================== */

export function insertConversionJob(
  id: string,
  projectId: string | null,
  status: ConversionJobRecord['status'],
  progress = 0
): void {
  const db = getDb();
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO conversion_jobs (id, project_id, model_id, status, progress, error_message, created_at, updated_at)
    VALUES (?, ?, NULL, ?, ?, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      progress = excluded.progress,
      updated_at = excluded.updated_at
  `);
  stmt.run(id, projectId, status, progress, now, now);
}

export function updateConversionJob(
  id: string,
  updates: Partial<Pick<ConversionJobRecord, 'status' | 'progress' | 'error_message' | 'model_id'>>
): void {
  const db = getDb();
  const existing = getConversionJob(id);
  if (!existing) return;

  const status = updates.status ?? existing.status;
  const progress = updates.progress ?? existing.progress;
  const errorMessage = updates.error_message !== undefined ? updates.error_message : existing.error_message;
  const modelId = updates.model_id !== undefined ? updates.model_id : existing.model_id;
  const now = Date.now();

  const stmt = db.prepare(`
    UPDATE conversion_jobs
    SET status = ?, progress = ?, error_message = ?, model_id = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(status, progress, errorMessage, modelId, now, id);
}

export function getConversionJob(id: string): ConversionJobRecord | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM conversion_jobs WHERE id = ?');
  const row = stmt.get(id);
  return (row as unknown as ConversionJobRecord) || null;
}

/**
 * Atomically persists converted FRAG artifacts to storage/models/ and SQLite.
 */
export function persistJobArtifacts(
  jobId: string,
  projectName: string,
  tempDir: string,
  partFiles: string[],
  cryptoRandomUUID: () => string,
  targetProjectId?: string
): ModelRecord[] {
  if (!isValidId(jobId)) {
    throw new Error(`ID de trabajo/proyecto no válido: ${jobId}`);
  }

  const effectiveProjectId = targetProjectId && isValidId(targetProjectId) ? targetProjectId : jobId;

  if (partFiles.length === 0) {
    throw new Error('No se han generado archivos de fragmento para persistir.');
  }

  // 1. Verify all temp files exist and are not empty before beginning
  for (const part of partFiles) {
    const src = path.join(tempDir, part);
    if (!fs.existsSync(src)) {
      throw new Error(`Archivo temporal de fragmento no encontrado en disco: ${src}`);
    }
    const stat = fs.statSync(src);
    if (stat.size === 0) {
      throw new Error(`El archivo de fragmento ${part} se generó con 0 bytes.`);
    }
  }

  const copiedFiles: { absPath: string; relPath: string; modelId: string; name: string; size: number }[] = [];

  try {
    // 2. Copy files to permanent storage under temp/models/<effectiveProjectId>/<cleanPartName> and storage/models/
    for (const part of partFiles) {
      const cleanPartName = path.basename(part);
      const modelId = cryptoRandomUUID();

      // Primary location: temp/models/<effectiveProjectId>/<cleanPartName>
      const tempProjectDir = path.join(TEMP_MODELS_DIR, effectiveProjectId);
      if (!fs.existsSync(tempProjectDir)) {
        fs.mkdirSync(tempProjectDir, { recursive: true });
      }
      const targetTempAbs = path.join(tempProjectDir, cleanPartName);
      const srcAbs = path.join(tempDir, part);
      fs.copyFileSync(srcAbs, targetTempAbs);

      // Also copy to root temp/ for direct fast lookup
      const rootTempAbs = path.join(TEMP_DIR, cleanPartName);
      try { fs.copyFileSync(srcAbs, rootTempAbs); } catch {}

      // Redundant backup: storage/models/<effectiveProjectId>/<modelId>/<cleanPartName>
      const modelDir = path.join(MODELS_DIR, effectiveProjectId, modelId);
      if (!fs.existsSync(modelDir)) {
        fs.mkdirSync(modelDir, { recursive: true });
      }
      const targetStorageAbs = path.join(modelDir, cleanPartName);
      try { fs.copyFileSync(srcAbs, targetStorageAbs); } catch {}

      // Verify file on disk in temp
      if (!fs.existsSync(targetTempAbs)) {
        throw new Error(`Fallo de verificación al persistir fragmento en temp: ${targetTempAbs}`);
      }
      const copiedSize = fs.statSync(targetTempAbs).size;
      const originalSize = fs.statSync(srcAbs).size;
      if (copiedSize !== originalSize) {
        throw new Error(`Inconsistencia en el tamaño del archivo persistido (${copiedSize} != ${originalSize}) para ${part}`);
      }

      const targetRel = `temp/models/${effectiveProjectId}/${cleanPartName}`.replace(/\\/g, '/');

      copiedFiles.push({
        absPath: targetTempAbs,
        relPath: targetRel,
        modelId,
        name: cleanPartName,
        size: copiedSize,
      });
    }

    // 3. Atomically persist metadata into SQLite using a transaction
    const db = getDb();
    db.exec('BEGIN');

    const now = Date.now();

    // Ensure project exists in SQLite
    const existingProj = getProject(effectiveProjectId);
    if (!existingProj) {
      const projStmt = db.prepare(`
        INSERT INTO projects (id, name, created_at)
        VALUES (?, ?, ?)
      `);
      projStmt.run(effectiveProjectId, projectName, now);
    }

    const modelInsertStmt = db.prepare(`
      INSERT INTO models (id, project_id, name, storage_path, size_bytes, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'ready', ?, ?)
    `);

    const persistedModels: ModelRecord[] = [];

    for (const copied of copiedFiles) {
      modelInsertStmt.run(
        copied.modelId,
        effectiveProjectId,
        copied.name,
        copied.relPath,
        copied.size,
        now,
        now
      );

      persistedModels.push({
        id: copied.modelId,
        project_id: effectiveProjectId,
        name: copied.name,
        storage_path: copied.relPath,
        size_bytes: copied.size,
        status: 'ready',
        created_at: now,
        updated_at: now,
      });
    }

    // Update conversion job with effective project ID and parts
    const primaryModelId = persistedModels[0]?.id || null;
    const partsJson = JSON.stringify(persistedModels.map((m) => m.name));
    const updateJobStmt = db.prepare(`
      UPDATE conversion_jobs
      SET status = 'completed', progress = 100, project_id = ?, model_id = ?, parts_json = ?, updated_at = ?
      WHERE id = ?
    `);
    updateJobStmt.run(effectiveProjectId, primaryModelId, partsJson, now, jobId);

    db.exec('COMMIT');

    console.log(`💾 [Persistence] ${copiedFiles.length} fragmento(s) persistido(s) exitosamente en storage/models/${effectiveProjectId}/`);
    return persistedModels;
  } catch (err) {
    const db = getDb();
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback error
    }

    // Clean up any partially copied persistent files
    for (const copied of copiedFiles) {
      try {
        if (fs.existsSync(copied.absPath)) {
          fs.unlinkSync(copied.absPath);
        }
        const dir = path.dirname(copied.absPath);
        if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
          fs.rmdirSync(dir);
        }
      } catch (cleanErr) {
        console.error('Error limpiando archivo persistente fallido:', cleanErr);
      }
    }

    console.error(`❌ [Persistence Error] Fallo al persistir fragmentos para el trabajo ${jobId}:`, err);
    throw err;
  }
}

/**
 * Persists a directly uploaded .frag file into storage/models/<projectId>/<modelId>/
 * and registers it in SQLite without running IFC conversion.
 */
export function persistDirectFragModel(
  projectId: string,
  fileName: string,
  tempFilePath: string
): ModelRecord {
  if (!isValidId(projectId)) {
    throw new Error(`ID de proyecto no válido: ${projectId}`);
  }

  const project = getProject(projectId);
  if (!project) {
    throw new Error(`Proyecto ${projectId} no encontrado en SQLite.`);
  }

  const cleanName = path.basename(fileName);
  if (!cleanName.toLowerCase().endsWith('.frag')) {
    throw new Error('Solo se admiten archivos con extensión .frag.');
  }

  if (!fs.existsSync(tempFilePath)) {
    throw new Error('El archivo temporal de carga no existe en disco.');
  }

  const stat = fs.statSync(tempFilePath);
  if (stat.size === 0) {
    throw new Error('El archivo .frag subido está vacío (0 bytes).');
  }

  if (stat.size < 4) {
    throw new Error('El archivo no contiene un formato binario .frag válido.');
  }

  const modelId = crypto.randomUUID();

  // Primary location: temp/models/<projectId>/<cleanName>
  const tempProjectDir = path.join(TEMP_MODELS_DIR, projectId);
  if (!fs.existsSync(tempProjectDir)) {
    fs.mkdirSync(tempProjectDir, { recursive: true });
  }
  const targetTempAbs = path.join(tempProjectDir, cleanName);
  fs.copyFileSync(tempFilePath, targetTempAbs);

  // Also copy to root temp/ for direct fast lookup
  const rootTempAbs = path.join(TEMP_DIR, cleanName);
  try { fs.copyFileSync(tempFilePath, rootTempAbs); } catch {}

  // Redundant backup: storage/models/<projectId>/<modelId>/<cleanName>
  const modelDir = path.join(MODELS_DIR, projectId, modelId);
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }
  const targetStorageAbs = path.join(modelDir, cleanName);
  try { fs.copyFileSync(tempFilePath, targetStorageAbs); } catch {}

  const copiedSize = fs.statSync(targetTempAbs).size;
  if (copiedSize !== stat.size) {
    try { fs.unlinkSync(targetTempAbs); } catch {}
    try { fs.unlinkSync(targetStorageAbs); } catch {}
    try { fs.rmdirSync(modelDir); } catch {}
    throw new Error('Inconsistencia en el tamaño del archivo .frag persistido.');
  }

  const targetRel = `temp/models/${projectId}/${cleanName}`.replace(/\\/g, '/');

  const db = getDb();
  const now = Date.now();

  try {
    const stmt = db.prepare(`
      INSERT INTO models (id, project_id, name, storage_path, size_bytes, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'ready', ?, ?)
    `);
    stmt.run(modelId, projectId, cleanName, targetRel, copiedSize, now, now);
  } catch (dbErr) {
    try { fs.unlinkSync(targetTempAbs); } catch {}
    try { fs.unlinkSync(targetStorageAbs); } catch {}
    try { fs.rmdirSync(modelDir); } catch {}
    throw dbErr;
  }

  console.log(`💾 [Direct FRAG] Modelo ${cleanName} guardado en temp y registrado como ${targetRel} para proyecto ${projectId}`);

  return {
    id: modelId,
    project_id: projectId,
    name: cleanName,
    storage_path: targetRel,
    size_bytes: copiedSize,
    status: 'ready',
    created_at: now,
    updated_at: now,
  };
}

/**
 * Permanently deletes a project, all its models from SQLite, and its storage directory.
 */
export function deleteProject(projectId: string): { success: boolean; deletedModelsCount: number } {
  if (!isValidId(projectId)) {
    throw new Error('ID de proyecto no válido');
  }

  const db = getDb();
  const proj = getProject(projectId);
  if (!proj) {
    throw new Error(`Proyecto con ID ${projectId} no encontrado.`);
  }

  const models = getModelsForProject(projectId);
  const deletedModelsCount = models.length;

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    db.exec('COMMIT');

    // Remove files from storage and temp
    const projectDir = path.join(MODELS_DIR, projectId);
    if (fs.existsSync(projectDir)) {
      try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch {}
    }
    const tempProjDir = path.join(TEMP_MODELS_DIR, projectId);
    if (fs.existsSync(tempProjDir)) {
      try { fs.rmSync(tempProjDir, { recursive: true, force: true }); } catch {}
    }

    console.log(`🗑️ [Storage & Temp] Proyecto ${projectId} y sus ${deletedModelsCount} modelo(s) eliminados.`);
    return { success: true, deletedModelsCount };
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    console.error(`Error al eliminar proyecto ${projectId}:`, err);
    throw err;
  }
}

/**
 * Closes the SQLite database gracefully on shutdown.
 */
export function closeDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
      console.log('🔒 Conexión SQLite cerrada correctamente.');
    } catch (err) {
      console.error('Error cerrando base de datos SQLite:', err);
    } finally {
      dbInstance = null;
    }
  }
}
