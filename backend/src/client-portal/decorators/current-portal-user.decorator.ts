import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface PortalUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  companyId: string;
  company: { id: string; name: string };
}

// Decorateur pour recuperer l'utilisateur portail courant dans un controller.
// Equivalent du `@CurrentUser` pour les routes internes.
export const CurrentPortalUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): PortalUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.portalUser;
  },
);
