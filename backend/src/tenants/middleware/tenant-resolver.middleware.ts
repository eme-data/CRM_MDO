import { Injectable, Logger, NestMiddleware, ServiceUnavailableException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Tenant } from '@prisma/client';
import { TenantsService } from '../tenants.service';

// Etend le type Request d'Express pour porter le tenant resolu.
declare module 'express-serve-static-core' {
  interface Request {
    tenant?: Tenant;
  }
}

// Middleware execute en global sur TOUTES les requetes. Resout le tenant
// depuis le Host header (ou X-Forwarded-Host derriere Caddy) et l'attache
// a req.tenant. Si le tenant n'existe pas, on attache req.tenant=null et le
// caller decide quoi faire (la plupart des routes refuseront).
//
// Routes "tenant-less" autorisees (pas de tenant requis) :
//   - /health, /metrics : monitoring
//   - /api/branding : utilise tenant si present, sinon defauts ENV
// Tout le reste DOIT avoir un tenant.

@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantResolverMiddleware.name);

  constructor(private readonly tenants: TenantsService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    // Caddy/Traefik forwardent le host original via X-Forwarded-Host.
    // Sans proxy, on prend Host directement.
    const host =
      (req.headers['x-forwarded-host'] as string | undefined) ??
      (req.headers.host as string | undefined) ??
      '';
    if (host) {
      const tenant = await this.tenants.resolveByDomain(host);
      if (tenant) {
        if (!tenant.isActive) {
          // Tenant existe mais desactive (impaye, maintenance, etc.). On bloque
          // toutes les requetes avec un 503 explicite plutot qu'un 404 trompeur.
          throw new ServiceUnavailableException('Instance suspendue. Contactez l\'administrateur.');
        }
        req.tenant = tenant;
      }
    }
    next();
  }
}
