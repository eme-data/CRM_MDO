import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

// Custom throttler qui rate-limit par (tenant, IP) plutot que par IP seule.
//
// Pourquoi : en multi-tenant sur une seule stack, un user du tenant A peut
// saturer son quota IP et bloquer tous les autres utilisateurs sortant via
// la meme IP publique (cas frequent : un tenant client derriere un NAT
// d'entreprise = tous les users sortent avec la meme IP). Sans tenant dans
// la cle de tracking, leurs requetes s'agrege et un seul user actif bloque
// tout le bureau.
//
// Pire : un user malveillant du tenant A pourrait deliberement saturer
// l'API et degrader le service de TOUS les autres tenants partageant son
// IP (NAT operateur, datacenter commun, etc.).
//
// Strategie : tracker = "<tenantId>:<ip>". Si pas de tenant resolu (route
// publique /health), on tombe sur IP seule (comportement legacy).
//
// Note : on garde IP dans la cle (et pas juste tenant) pour eviter qu'un
// tenant avec beaucoup de users soit tres vite throttle au global. Chaque
// IP (= chaque user en pratique, ou chaque site bureau) a son propre quota
// DANS son tenant.

@Injectable()
export class TenantThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    // X-Forwarded-For derriere Caddy : on prend le premier IP (celle du client),
    // sinon req.ip. Fallback "unknown" pour ne jamais throw.
    const fwd = req.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(fwd)
      ? fwd[0]?.split(',')[0]?.trim()
      : (fwd as string | undefined)?.split(',')[0]?.trim();
    const ip = forwardedIp ?? req.ip ?? 'unknown';
    const tenantId = req.tenant?.id ?? 'no-tenant';
    return tenantId + ':' + ip;
  }
}
