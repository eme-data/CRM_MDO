import type { Response } from 'express';

// Noms des cookies (utilises aussi cote SSO bridge -> garder synchro).
// Voir main.ts ligne ~91 pour le commentaire d'origine.
export const ACCESS_COOKIE = 'mdo_access';
export const REFRESH_COOKIE = 'mdo_refresh';

// Migration progressive : on set systematiquement les cookies httpOnly a chaque
// login/refresh, mais on continue de retourner les tokens en body pour la
// retro-compat avec les clients qui les stockent encore en localStorage.
// Quand 100% du frontend sera passe en credentials:include, on pourra retirer
// les tokens du body (breaking change). Cf docs/auth-cookies-migration.md.

function parseDuration(d: string | undefined, fallbackMs: number): number {
  if (!d) return fallbackMs;
  const m = d.match(/^(\d+)([smhd])$/);
  if (!m) return fallbackMs;
  const value = parseInt(m[1], 10);
  const unit = m[2];
  const mult: Record<string, number> = {
    s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000,
  };
  return value * mult[unit];
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
  config: { accessExpiresIn?: string; refreshExpiresIn?: string; isProd: boolean },
) {
  const accessMs = parseDuration(config.accessExpiresIn, 15 * 60_000);
  const refreshMs = parseDuration(config.refreshExpiresIn, 7 * 86_400_000);

  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    maxAge: accessMs,
    path: '/',
  });

  // Le refresh est restreint au path /api/auth : aucun autre endpoint n'en a
  // besoin, et limiter le path reduit la surface d'exposition (le cookie est
  // simplement absent des requetes vers /api/companies/* etc.).
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    maxAge: refreshMs,
    path: '/api/auth',
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}
