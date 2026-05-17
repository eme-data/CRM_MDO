import { AssetLifecycleService } from './asset-lifecycle.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

// Tests anti-regression du fix d781bb9 (audit pass 2, 2026-05-17).
// overview() / stats() ne prenaient pas JwtUser et exfiltraient
// l'inventaire IT hardware de tous les tenants (vendor, model, lifecycle
// status NIS2, budget remplacement). Verifie maintenant le scope.

describe('AssetLifecycleService — tenant isolation', () => {
  let service: AssetLifecycleService;
  let prisma: any;
  let scope: TenantScope;

  const userA: JwtUser = {
    id: 'user-A', email: 'a@x.fr', firstName: 'A', lastName: '',
    role: 'ADMIN', tenantId: 'tenant-A', isSuperAdmin: false,
  } as any;
  const superAdmin: JwtUser = {
    id: 'user-S', email: 's@x.fr', firstName: 'S', lastName: '',
    role: 'ADMIN', tenantId: 'tenant-mdo', isSuperAdmin: true,
  } as any;

  beforeEach(() => {
    prisma = {
      asset: { findMany: jest.fn().mockResolvedValue([]) },
      company: { findFirst: jest.fn() },
    };
    scope = new TenantScope(prisma);
    service = new AssetLifecycleService(prisma, scope);
  });

  describe('overview', () => {
    it('filtre par tenantId pour user normal', async () => {
      await service.overview(userA);
      const where = prisma.asset.findMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe('tenant-A');
    });

    it('super-admin : pas de filtre tenantId', async () => {
      await service.overview(superAdmin);
      const where = prisma.asset.findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('tenantId');
    });

    it('refuse si companyId fourni hors tenant', async () => {
      prisma.company.findFirst.mockResolvedValue(null);
      await expect(service.overview(userA, { companyId: 'co-X' }))
        .rejects.toThrow();
    });
  });

  describe('stats', () => {
    it('appelle overview avec le meme user (scope tenant)', async () => {
      await service.stats(userA);
      const where = prisma.asset.findMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe('tenant-A');
    });
  });
});
