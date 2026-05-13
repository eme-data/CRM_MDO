// Client API dedie au portail client. Stocke le token de session dans
// localStorage sous une cle distincte (crm_portal_session), et l'envoie
// via le header X-Portal-Session (pas de cookies pour eviter CSRF en l'etat).

const PORTAL_SESSION_KEY = 'crm_portal_session';

export function getPortalSession(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PORTAL_SESSION_KEY);
}

export function setPortalSession(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PORTAL_SESSION_KEY, token);
}

export function clearPortalSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PORTAL_SESSION_KEY);
}

class PortalApiError extends Error {
  constructor(public status: number, message: string, public body?: any) {
    super(message);
  }
}

async function doFetch(path: string, init: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  const session = getPortalSession();
  if (session) headers['X-Portal-Session'] = session;

  const res = await fetch('/api/portal' + path, { ...init, headers });

  if (res.status === 401) {
    clearPortalSession();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/portal/login')) {
      window.location.href = '/portal/login';
    }
    throw new PortalApiError(401, 'Session expiree');
  }

  if (!res.ok) {
    let body: any = null;
    try { body = await res.json(); } catch {}
    throw new PortalApiError(res.status, body?.message || res.statusText, body);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const portalApi = {
  get: (path: string) => doFetch(path),
  post: (path: string, body?: any) =>
    doFetch(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
};

export { PortalApiError };
