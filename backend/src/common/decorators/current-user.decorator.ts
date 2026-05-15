import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtUser {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  mfaPending?: boolean;
  // Multi-tenant : tenant d'appartenance du user. Null transitoire pour les
  // users existants pre-migration, sera NOT NULL une fois la migration finie.
  tenantId: string | null;
  // Super-admin : peut acceder aux endpoints /tenants/* et switcher de
  // contexte tenant. Mathieu uniquement par defaut.
  isSuperAdmin: boolean;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as JwtUser;
    return data ? user?.[data] : user;
  },
);
