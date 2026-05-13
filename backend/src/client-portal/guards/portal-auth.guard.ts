import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PortalAuthService } from '../portal-auth.service';
import { PORTAL_PUBLIC_KEY } from '../decorators/portal-public.decorator';

// Guard d'authentification du portail client : extrait le token de session du
// header `X-Portal-Session`, resout le user portail correspondant, et attache
// `req.portalUser` pour les controllers.
// Les routes /portal/auth/request-magic-link et /portal/auth/verify utilisent
// @PortalPublic() pour bypasser ce guard tout en restant @Public() (donc
// non auth JWT interne).
@Injectable()
export class PortalAuthGuard implements CanActivate {
  constructor(
    private readonly portalAuth: PortalAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPortalPublic = this.reflector.getAllAndOverride<boolean>(PORTAL_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPortalPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { portalUser?: any }>();
    // Le token peut etre passe via :
    //   - Header X-Portal-Session (utilise par le frontend portal)
    //   - Cookie crm_portal_session (si on decide d'utiliser des cookies plus tard)
    //   - Authorization: Bearer <token> (pour clients API tiers eventuellement)
    const headerToken = req.headers['x-portal-session'] as string | undefined;
    const auth = req.headers.authorization;
    const bearerToken = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
    const cookieToken = (req as any).cookies?.crm_portal_session;
    const token = headerToken ?? bearerToken ?? cookieToken;

    if (!token) {
      throw new UnauthorizedException('Session portail requise.');
    }

    const session = await this.portalAuth.getSession(token);
    if (!session) {
      throw new UnauthorizedException('Session invalide ou expiree.');
    }

    req.portalUser = {
      id: session.user.id,
      email: session.user.email,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      companyId: session.user.companyId,
      company: session.user.company,
    };
    return true;
  }
}
