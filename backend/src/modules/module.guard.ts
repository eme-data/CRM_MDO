import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { featureForPath, resolveFeatures } from './module-catalog';

// Guard global d'entitlements : bloque l'acces aux routes d'un module non
// inclus dans l'offre du tenant (renvoie 403). S'appuie sur :
//   - req.tenant (pose par TenantResolverMiddleware) -> enabledModules
//   - req.user (pose par JwtAuthGuard) -> isSuperAdmin
//
// Politique (cf module-catalog) :
//   - pas d'utilisateur authentifie (route publique) -> laisser passer
//     (l'auth est geree par les autres guards) ;
//   - super-admin -> acces total ;
//   - pas de tenant resolu -> laisser passer (routes transverses / branding) ;
//   - chemin ne correspondant a aucun feature -> laisser passer (fail-open
//     sur les routes transverses : auth, settings, notifications, admin...) ;
//   - sinon : 403 si le feature n'est pas dans les features effectives.
@Injectable()
export class ModuleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return true;
    if (user.isSuperAdmin) return true;

    const tenant = req.tenant;
    if (!tenant) return true;

    const feature = featureForPath(req.path ?? req.url ?? '');
    if (!feature) return true;

    const effective = resolveFeatures(tenant.enabledModules);
    if (effective.includes(feature)) return true;

    throw new ForbiddenException(
      'Module non inclus dans votre offre. Contactez votre administrateur.',
    );
  }
}
