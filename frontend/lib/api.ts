// Toujours relatif. En prod, Caddy route /api/* vers le backend.
// En dev, next.config.js 'rewrites' reroute /api/* vers http://backend:4000.
const API_URL = '/api';
const STORAGE_TOKEN = 'crm_mdo_access_token';
const STORAGE_REFRESH = 'crm_mdo_refresh_token';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: any,
  ) {
    super(message);
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_TOKEN);
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_REFRESH);
}

export function setTokens(accessToken: string, refreshToken: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_TOKEN, accessToken);
  localStorage.setItem(STORAGE_REFRESH, refreshToken);
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_TOKEN);
  localStorage.removeItem(STORAGE_REFRESH);
}

async function doFetch(path: string, init: RequestInit = {}, retry = true): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;

  const res = await fetch(API_URL + path, { ...init, headers });

  if (res.status === 401 && retry) {
    const refresh = getRefreshToken();
    if (refresh) {
      try {
        const r = await fetch(API_URL + '/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refresh }),
        });
        if (r.ok) {
          const data = await r.json();
          setTokens(data.accessToken, data.refreshToken);
          return doFetch(path, init, false);
        }
      } catch {}
    }
    clearTokens();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiError(401, 'Session expiree');
  }

  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch {}
    throw new ApiError(res.status, body?.message || res.statusText, body);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (path: string) => doFetch(path),
  post: (path: string, body?: any) =>
    doFetch(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: (path: string, body?: any) =>
    doFetch(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  put: (path: string, body?: any) =>
    doFetch(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  delete: (path: string) => doFetch(path, { method: 'DELETE' }),
};

export { ApiError };
