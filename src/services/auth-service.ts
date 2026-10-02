import { ref, computed } from 'vue';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  isActive: boolean;
  assignedProjectIds: string[];
  createdAt: number;
}

export interface AdminUserItem {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  isActive: boolean;
  assignedProjectIds: string[];
  assignedProjectsCount: number;
  createdAt: number;
  updatedAt: number;
}

export const currentUser = ref<UserSession | null>(null);
export const isAuthLoading = ref<boolean>(true);
export const authError = ref<string | null>(null);

export const isAuthenticated = computed(() => currentUser.value !== null);
export const isAdmin = computed(() => currentUser.value?.role === 'admin');

/**
 * Checks current session with the backend (/api/auth/me).
 */
export async function checkSession(): Promise<UserSession | null> {
  isAuthLoading.value = true;
  authError.value = null;
  try {
    const res = await fetch('/api/auth/me', {
      credentials: 'include',
    });
    if (!res.ok) {
      currentUser.value = null;
      return null;
    }
    const data = await res.json();
    if (data.authenticated && data.user) {
      currentUser.value = data.user;
      return data.user;
    } else {
      currentUser.value = null;
      return null;
    }
  } catch (err) {
    console.warn('[Auth] Error consultando estado de sesión:', err);
    currentUser.value = null;
    return null;
  } finally {
    isAuthLoading.value = false;
  }
}

/**
 * Performs secure login and establishes HttpOnly cookie session.
 */
export async function login(email: string, password: string): Promise<UserSession> {
  isAuthLoading.value = true;
  authError.value = null;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      const msg = data.error || 'Fallo de autenticación.';
      authError.value = msg;
      throw new Error(msg);
    }

    currentUser.value = data.user;
    return data.user;
  } catch (err: any) {
    authError.value = err.message || 'Error de conexión durante el inicio de sesión.';
    throw err;
  } finally {
    isAuthLoading.value = false;
  }
}

/**
 * Closes the active session and clears the cookie.
 */
export async function logout(): Promise<void> {
  isAuthLoading.value = true;
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch (err) {
    console.warn('[Auth] Error en cierre de sesión:', err);
  } finally {
    currentUser.value = null;
    isAuthLoading.value = false;
  }
}

/* ===================================================================
 * ADMIN USER MANAGEMENT APIS
 * =================================================================== */

export async function adminFetchUsers(query?: string): Promise<AdminUserItem[]> {
  const url = query ? `/api/users?q=${encodeURIComponent(query)}` : '/api/users';
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Error obteniendo usuarios (${res.status})`);
  }
  const data = await res.json();
  return data.users || [];
}

export async function adminCreateUser(payload: {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
  isActive: boolean;
  assignedProjectIds?: string[];
}): Promise<AdminUserItem> {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Error creando usuario (${res.status})`);
  }
  const data = await res.json();
  return data.user;
}

export async function adminUpdateUser(
  id: string,
  payload: {
    name?: string;
    email?: string;
    password?: string;
    role?: 'admin' | 'user';
    isActive?: boolean;
    assignedProjectIds?: string[];
  }
): Promise<AdminUserItem> {
  const res = await fetch(`/api/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Error actualizando usuario (${res.status})`);
  }
  const data = await res.json();
  return data.user;
}

export async function adminDeleteUser(id: string): Promise<void> {
  const res = await fetch(`/api/users/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Error eliminando usuario (${res.status})`);
  }
}

export async function adminUpdateUserProjects(userId: string, projectIds: string[]): Promise<string[]> {
  const res = await fetch(`/api/users/${userId}/projects`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ projectIds }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Error asignando proyectos (${res.status})`);
  }
  const data = await res.json();
  return data.assignedProjectIds;
}
