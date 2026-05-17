import { ForbiddenException } from '@nestjs/common';
import { SuperAdminGuard } from './super-admin.guard';

// Tests anti-regression du fix d781bb9 (audit pass 2) : system-backup
// passe de @Roles('ADMIN') a SuperAdminGuard. Sans ce guard, un ADMIN
// d'un tenant client pouvait list/download/restore les backups SYSTEME
// (BDD entiere tous tenants confondus = exfiltration totale du SaaS).
//
// Ce test garde-fou casse si quelqu'un re-introduit @Roles('ADMIN') a
// la place de SuperAdminGuard sur system-backup endpoints.

describe('SuperAdminGuard', () => {
  let guard: SuperAdminGuard;

  beforeEach(() => {
    guard = new SuperAdminGuard();
  });

  const mockCtx = (user: any) => ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as any;

  it('autorise si user.isSuperAdmin=true', () => {
    expect(guard.canActivate(mockCtx({ isSuperAdmin: true, role: 'ADMIN' }))).toBe(true);
  });

  it('refuse si user.isSuperAdmin=false (meme si ADMIN)', () => {
    expect(() => guard.canActivate(mockCtx({ isSuperAdmin: false, role: 'ADMIN' })))
      .toThrow(ForbiddenException);
  });

  it('refuse si user.isSuperAdmin manquant (undefined)', () => {
    expect(() => guard.canActivate(mockCtx({ role: 'ADMIN' })))
      .toThrow(ForbiddenException);
  });

  it('refuse si pas de user (route mal protegee par JwtAuthGuard amont)', () => {
    expect(() => guard.canActivate(mockCtx(undefined)))
      .toThrow(ForbiddenException);
  });

  it('CRITIQUE : refuse un ADMIN tenant non-super (cas system-backup)', () => {
    // Reproduit le cas exact du leak d'origine : un ADMIN d'un tenant
    // client tentait d'acceder /system-backup. Sans SuperAdminGuard,
    // le @Roles('ADMIN') laissait passer. Avec, c'est refuse.
    const adminTenant = {
      id: 'admin-tenantA', role: 'ADMIN', tenantId: 'tenant-A',
      isSuperAdmin: false,
    };
    expect(() => guard.canActivate(mockCtx(adminTenant)))
      .toThrow('Reserve au super-administrateur');
  });
});
