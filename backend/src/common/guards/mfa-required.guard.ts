import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_MFA_PENDING_KEY } from '../decorators/allow-mfa-pending.decorator';

// Bloque les requetes des utilisateurs dont le role exige la 2FA mais qui ne
// l'ont pas encore activee. Whitelist : routes publiques, routes explicitement
// marquees @AllowMfaPending. Le claim `mfaPending` est positionne au login par
// AuthService et propage dans le JWT.
@Injectable()
export class MfaRequiredGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_MFA_PENDING_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowPending) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return true; // sera rejete plus loin par le RolesGuard si necessaire
    if (user.mfaPending) {
      throw new ForbiddenException('MFA_REQUIRED');
    }
    return true;
  }
}
