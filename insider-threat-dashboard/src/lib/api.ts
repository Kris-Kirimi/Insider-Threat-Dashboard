// lib/api.ts — the single API client for the app.
//
// Configure the backend host with NEXT_PUBLIC_API_BASE (default: local dev
// server). All helpers attach the JWT access token; on a 401 they try one
// refresh-token exchange and retry, and redirect to /login when that fails.

export const API_HOST = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';
const BASE = `${API_HOST}/api`;

function getToken(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(key);
}

function authHeader(): Record<string, string> {
  const token = getToken('accessToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function redirectToLogin() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  // Multiple parallel 401s share one refresh request.
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refresh = getToken('refreshToken');
      if (!refresh) return false;
      try {
        const res = await fetch(`${API_HOST}/api/token/refresh/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (data.access) {
          localStorage.setItem('accessToken', data.access);
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        setTimeout(() => { refreshPromise = null; }, 0);
      }
    })();
  }
  return refreshPromise;
}

async function request(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), ...authHeader() },
  });
  if (res.status === 401 && !retried && getToken('refreshToken')) {
    const refreshed = await tryRefreshToken();
    if (refreshed) return request(path, init, true);
    redirectToLogin();
  }
  return res;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = '';
    try {
      msg = await res.text();
    } catch {
      msg = String(res.status);
    }
    const err = new Error(msg || `HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

export async function apiGet<T = any>(path: string) {
  return handleResponse<T>(await request(path));
}

export async function apiPost<T = any>(path: string, body: unknown) {
  return handleResponse<T>(await request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function apiPut<T = any>(path: string, body: unknown) {
  return handleResponse<T>(await request(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function apiPatch<T = any>(path: string, body: unknown) {
  return handleResponse<T>(await request(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function apiDelete<T = any>(path: string) {
  return handleResponse<T>(await request(path, { method: 'DELETE' }));
}

export async function apiUpload<T = any>(path: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  // No Content-Type header: the browser sets the multipart boundary.
  return handleResponse<T>(await request(path, { method: 'POST', body: formData }));
}

/** Download a protected file and trigger a browser save dialog. */
export async function apiDownload(path: string, filename: string) {
  const res = await request(path);
  if (!res.ok) {
    const err = new Error(`${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const blob = await res.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Legacy helper kept for pages that build absolute URLs themselves. */
export async function apiGetWithAuth(url: string, token: string | null) {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return handleResponse(res);
}
