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

// Endpoints d'authentification : un 401 ici signifie "identifiants invalides"
// ou "TOTP_REQUIRED", PAS "session expiree". On ne doit donc ni tenter de
// refresh, ni rediriger vers /login (la page se rechargerait en perdant l'etat
// du formulaire — bug bloquant pour la 2FA).
const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh'];

async function doFetch(path: string, init: RequestInit = {}, retry = true): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  // Migration cookies httpOnly : le backend set mdo_access et mdo_refresh
  // (immune XSS). Le header Bearer reste en fallback tant que des sessions
  // localStorage existent (les tokens sont rotates au prochain login/refresh).
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;

  const res = await fetch(API_URL + path, {
    ...init,
    headers,
    credentials: 'include',
  });

  const isAuthEndpoint = AUTH_ENDPOINTS.some((p) => path.startsWith(p));

  if (res.status === 401 && retry && !isAuthEndpoint) {
    // Le refresh peut venir soit du cookie httpOnly mdo_refresh (envoye
    // automatiquement par credentials:'include'), soit du localStorage en
    // mode legacy. On tente meme sans token explicite : le backend acceptera
    // le cookie s'il est present.
    const refresh = getRefreshToken();
    try {
      const r = await fetch(API_URL + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(refresh ? { refreshToken: refresh } : {}),
      });
      if (r.ok) {
        const data = await r.json();
        // Backward compat : si le backend renvoie encore les tokens en body,
        // on les met en localStorage. A terme (apres rollout cookies), le
        // body n'inclura plus les tokens et localStorage sera vide -> auth
        // 100% via cookie.
        if (data?.accessToken && data?.refreshToken) {
          setTokens(data.accessToken, data.refreshToken);
        }
        return doFetch(path, init, false);
      }
    } catch {}
    clearTokens();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Session expiree');
  }

  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch {}
    // 403 MFA_REQUIRED : l'utilisateur est authentifie mais sa 2FA n'est pas
    // activee. On le redirige vers /settings (qui est sur la whitelist du
    // MfaRequiredGuard) pour qu'il puisse finaliser l'activation.
    if (
      res.status === 403 &&
      typeof window !== 'undefined' &&
      (body?.message === 'MFA_REQUIRED' || String(body?.message ?? '').includes('MFA_REQUIRED'))
    ) {
      if (window.location.pathname !== '/settings') {
        window.location.href = '/settings?mfaSetup=1';
      }
      throw new ApiError(403, 'MFA_REQUIRED', body);
    }
    throw new ApiError(res.status, body?.message || res.statusText, body);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: <T = any>(path: string): Promise<T> => doFetch(path),
  post: <T = any>(path: string, body?: any): Promise<T> =>
    doFetch(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T = any>(path: string, body?: any): Promise<T> =>
    doFetch(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  put: <T = any>(path: string, body?: any): Promise<T> =>
    doFetch(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  delete: <T = any>(path: string): Promise<T> => doFetch(path, { method: 'DELETE' }),
};

export { ApiError };

export const apiUpload = {
  // Upload de fichiers (multipart/form-data)
  async upload(path: string, files: File[], extra: Record<string, string> = {}): Promise<any> {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('crm_mdo_access_token') : null;
    const res = await fetch('/api' + path, {
      method: 'POST',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      credentials: 'include',
      body: fd,
    });
    if (!res.ok) {
      let body: any = null;
      try { body = await res.json(); } catch {}
      throw new ApiError(res.status, body?.message || res.statusText, body);
    }
    return res.json();
  },
};

// Helper a utiliser dans les fetch direct (downloads binaires, uploads
// multipart) : ajoute credentials:'include' pour envoyer les cookies httpOnly
// + le Bearer header de fallback. Les pages qui faisaient leur propre fetch
// avec localStorage doivent migrer vers ca pour fonctionner cote nouveaux
// users (qui n'auront que le cookie, pas le localStorage).
export function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers ?? {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', 'Bearer ' + token);
  }
  return fetch(url, { ...init, headers, credentials: 'include' });
}

export function attachmentDownloadUrl(id: string): string {
  // L'attachment endpoint exige un Bearer token via fetch ; on utilise donc un click handler.
  return '/api/attachments/' + id;
}

export async function downloadAttachment(id: string, filename: string) {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('crm_mdo_access_token') : null;
  const res = await fetch('/api/attachments/' + id, {
    headers: token ? { Authorization: 'Bearer ' + token } : {},
    credentials: 'include',
  });
  if (!res.ok) throw new ApiError(res.status, 'Erreur telechargement');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
