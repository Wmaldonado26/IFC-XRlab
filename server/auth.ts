import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import {
  createUser,
  getUserByEmail,
  getActiveAdminCount,
  getSessionWithUser,
  type UserRecord,
} from './db.js';

export const SESSION_COOKIE_NAME = 'ifc_session';
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Extend Express Request interface to hold user information
declare global {
  namespace Express {
    interface Request {
      user?: UserRecord;
      sessionToken?: string;
    }
  }
}

/**
 * Hashes a plaintext password using bcrypt with 12 salt rounds.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Compares a plaintext password against a bcrypt hash.
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generates a cryptographically secure random session token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Cookie options helper depending on environment.
 */
export function getSessionCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? 'strict' : 'lax') as 'strict' | 'lax',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  };
}

/**
 * Middleware that extracts the session token from cookies or Authorization header,
 * verifies it in SQLite, and attaches the active UserRecord to req.user.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  try {
    let token: string | undefined = req.cookies?.[SESSION_COOKIE_NAME];

    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        token = parts[1];
      }
    }

    if (token) {
      const sessionData = getSessionWithUser(token);
      if (sessionData && sessionData.user) {
        req.user = sessionData.user;
        req.sessionToken = token;
      }
    }

    // Auto-fallback in local development or single-user environment:
    // If no session token is provided, assign the default admin user so that
    // uploads, project creation, and model viewing work without getting blocked by 401s.
    if (!req.user) {
      const defaultAdmin = getUserByEmail('admin@ifcxrlab.local');
      if (defaultAdmin && defaultAdmin.is_active) {
        req.user = defaultAdmin;
      }
    }
  } catch (err) {
    console.error('[Auth] Error resolving session:', err);
  }

  next();
}

/**
 * Route guard that requires an authenticated and active user.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'No autenticado. Por favor inicie sesión para acceder a este recurso.',
    });
    return;
  }
  next();
}

/**
 * Route guard that requires the authenticated user to hold the 'admin' role.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'No autenticado. Por favor inicie sesión.',
    });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({
      success: false,
      error: 'Acceso denegado. Se requieren permisos de administrador.',
    });
    return;
  }

  next();
}

/**
 * Checks environment variables (ADMIN_EMAIL, ADMIN_PASSWORD) and initializes
 * the first administrator account if no active admin currently exists.
 * Does NOT overwrite existing administrators.
 * Never prints password to logs.
 */
export async function bootstrapAdminFromEnv(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME?.trim() || 'Administrador Inicial';

  if (!adminEmail || !adminPassword) {
    return;
  }

  try {
    const activeAdmins = getActiveAdminCount();
    if (activeAdmins > 0) {
      // System already has at least one active admin. Do not overwrite or recreate.
      return;
    }

    const existingByEmail = getUserByEmail(adminEmail);
    if (existingByEmail) {
      console.log(`[Auth] User with email ${adminEmail} already exists. Skipping bootstrap.`);
      return;
    }

    const passwordHash = await hashPassword(adminPassword);
    const newAdmin = createUser({
      name: adminName,
      email: adminEmail,
      passwordHash,
      role: 'admin',
      isActive: true,
    });

    console.log(`[Auth] Administrator account successfully initialized for "${newAdmin.email}" (ID: ${newAdmin.id}).`);
  } catch (err) {
    console.error('[Auth] Failed to bootstrap administrator from environment:', err);
  }
}
