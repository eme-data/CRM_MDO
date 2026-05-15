import { createParamDecorator, ExecutionContext, NotFoundException } from '@nestjs/common';
import { Tenant } from '@prisma/client';

// Decorateur : `@CurrentTenant() tenant: Tenant` injecte le tenant resolu par
// le middleware. Throw 404 si pas de tenant (= domaine non reconnu) — la
// plupart des controllers veulent ce comportement strict.
//
// Pour les endpoints qui acceptent l'absence de tenant (ex: /branding qui
// fallback sur ENV), utiliser `@OptionalTenant()` ci-dessous a la place.
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Tenant => {
    const req = ctx.switchToHttp().getRequest();
    if (!req.tenant) {
      throw new NotFoundException('Aucun tenant pour ce domaine');
    }
    return req.tenant;
  },
);

export const OptionalTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Tenant | undefined => {
    const req = ctx.switchToHttp().getRequest();
    return req.tenant;
  },
);
