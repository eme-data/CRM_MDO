import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

// Guard simple : exige req.user.isSuperAdmin === true. Utilise sur les
// endpoints de pilotage SaaS (creation tenant, switch contexte, stats globales).
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.user?.isSuperAdmin) {
      throw new ForbiddenException('Reserve au super-administrateur');
    }
    return true;
  }
}
