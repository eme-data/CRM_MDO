import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TenantScope } from './tenant-scope.helper';
import { JwtUser } from '../decorators/current-user.decorator';

// Tests du helper TenantScope : c'est la fondation de tous les services
// scopes des vagues 11. Si scopedWhere a un bug, c'est tout l'isolation
// multi-tenant qui tombe.

describe('TenantScope', () => {
  let prisma: any;
  let scope: TenantScope;

  const userA: JwtUser = {
    id: 'user-A', email: 'a@x.fr', firstName: 'A', lastName: '',
    role: 'ADMIN', tenantId: 'tenant-A', isSuperAdmin: false,
  } as any;
  const userB: JwtUser = {
    id: 'user-B', email: 'b@x.fr', firstName: 'B', lastName: '',
    role: 'ADMIN', tenantId: 'tenant-B', isSuperAdmin: false,
  } as any;
  const superAdmin: JwtUser = {
    id: 'user-S', email: 's@x.fr', firstName: 'S', lastName: '',
    role: 'ADMIN', tenantId: 'tenant-mdo', isSuperAdmin: true,
  } as any;

  beforeEach(() => {
    prisma = { company: { findFirst: jest.fn() } };
    scope = new TenantScope(prisma);
  });

  describe('scopedWhere', () => {
    it('injecte tenantId pour un user normal', () => {
      expect(scope.scopedWhere(userA)).toEqual({ tenantId: 'tenant-A' });
    });

    it('preserve les filtres extras passes en argument', () => {
      expect(scope.scopedWhere(userA, { status: 'ACTIVE' })).toEqual({
        tenantId: 'tenant-A',
        status: 'ACTIVE',
      });
    });

    it('renvoie les filtres bruts (sans tenantId) pour un super-admin', () => {
      // CRITIQUE : le super-admin doit pouvoir voir tous les tenants.
      expect(scope.scopedWhere(superAdmin)).toEqual({});
      expect(scope.scopedWhere(superAdmin, { status: 'ACTIVE' })).toEqual({ status: 'ACTIVE' });
    });

    it('isole : deux users de tenants distincts produisent des wheres differents', () => {
      const wA = scope.scopedWhere(userA);
      const wB = scope.scopedWhere(userB);
      expect(wA.tenantId).not.toBe(wB.tenantId);
    });
  });

  describe('assertCompanyInTenant', () => {
    it('autorise si la company existe dans le tenant courant', async () => {
      prisma.company.findFirst.mockResolvedValue({ id: 'co-1' });
      await expect(scope.assertCompanyInTenant('co-1', userA)).resolves.toBeUndefined();
      expect(prisma.company.findFirst).toHaveBeenCalledWith({
        where: { id: 'co-1', tenantId: 'tenant-A' },
        select: { id: true },
      });
    });

    it('REJETTE (Forbidden) si la company est dans un autre tenant', async () => {
      // Simule : la company existe mais pas dans le tenant courant
      prisma.company.findFirst.mockResolvedValue(null);
      await expect(scope.assertCompanyInTenant('co-X', userA)).rejects.toThrow(ForbiddenException);
    });

    it('bypass complet pour super-admin (pas de lookup)', async () => {
      await expect(scope.assertCompanyInTenant('co-quelconque', superAdmin)).resolves.toBeUndefined();
      // Important : on ne fait MEME PAS la query si super-admin (perf + simplicite).
      expect(prisma.company.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('assertEntityInTenant', () => {
    it('autorise et retourne l\'entite si elle existe dans le tenant', async () => {
      const entity = { id: 'e-1', tenantId: 'tenant-A' };
      const fetcher = jest.fn().mockResolvedValue(entity);
      const result = await scope.assertEntityInTenant(fetcher, 'e-1', userA);
      expect(result).toBe(entity);
      expect(fetcher).toHaveBeenCalledWith({ id: 'e-1', tenantId: 'tenant-A' });
    });

    it('throw NotFoundException si entite introuvable (pas Forbidden pour ne pas reveler l\'existence)', async () => {
      const fetcher = jest.fn().mockResolvedValue(null);
      await expect(scope.assertEntityInTenant(fetcher, 'e-X', userA)).rejects.toThrow(NotFoundException);
    });

    it('super-admin : fetcher appele SANS tenantId dans le where (acces total)', async () => {
      const fetcher = jest.fn().mockResolvedValue({ id: 'e-1', tenantId: 'tenant-X' });
      await scope.assertEntityInTenant(fetcher, 'e-1', superAdmin);
      expect(fetcher).toHaveBeenCalledWith({ id: 'e-1' });
    });
  });
});
