import { api, setTokens } from './api';

// Statut SSO du tenant courant (resolu par le backend depuis le Host).
// Affiche le bouton "Sign in with SSO" si enabled=true sur /login.
export interface SsoStatus {
  enabled: boolean;
  tenantSlug: string | null;
}

export async function getSsoStatus(): Promise<SsoStatus> {
  try {
    return await api.get<SsoStatus>('/auth/sso/status');
  } catch {
    // 503 si tenant pas resolu : on degrade silencieusement (pas de bouton)
    return { enabled: false, tenantSlug: null };
  }
}

// URL d'init du flow SSO. Le navigateur est redirige vers l'IdP.
export function ssoStartUrl(tenantSlug: string, returnPath?: string): string {
  const ret = returnPath && returnPath.startsWith('/') ? returnPath : '/dashboard';
  return `/api/auth/sso/${encodeURIComponent(tenantSlug)}/start?return=${encodeURIComponent(ret)}`;
}

// Termine le flow apres callback : recupere les tokens du cookie one-shot
// emis par le backend, les stocke dans localStorage (compat reste de l'app).
// Renvoie le chemin de retour pour la redirection finale.
export interface SsoExchange {
  accessToken: string;
  refreshToken: string;
  returnPath: string;
}

export async function exchangeSsoTokens(): Promise<SsoExchange> {
  const r = await fetch('/api/auth/sso/exchange', {
    credentials: 'include', // cookie HTTP-only emit par le callback
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body?.message || 'Echange SSO echec');
  }
  const data: SsoExchange = await r.json();
  setTokens(data.accessToken, data.refreshToken);
  return data;
}
