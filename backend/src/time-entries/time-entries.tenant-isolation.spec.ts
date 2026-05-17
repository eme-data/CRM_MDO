import { TimeEntriesService } from './time-entries.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

// Tests anti-regression du fix c61ab22 (audit pass 1, 2026-05-17).
// Les methodes summary/billingByCompany/billingDetail leakaient les
// agregats CA/heures de tous les tenants. Verifie maintenant que
// scope.scopedWhere injecte tenantId dans la WHERE.

describe('TimeEntriesService — tenant isolation', () => {
  let service: TimeEntriesService;
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
      timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
      company: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };
    scope = new TenantScope(prisma);
    service = new TimeEntriesService(prisma, {} as any, scope);
  });

  describe('summary', () => {
    it('inclut tenantId dans la WHERE pour user normal', async () => {
      await service.summary({}, userA);
      const where = prisma.timeEntry.findMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe('tenant-A');
    });

    it('super-admin : pas de filtre tenantId', async () => {
      await service.summary({}, superAdmin);
      const where = prisma.timeEntry.findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('tenantId');
    });
  });

  describe('billingByCompany', () => {
    it('inclut tenantId dans la WHERE', async () => {
      await service.billingByCompany(
        { from: '2026-01-01', to: '2026-01-31' },
        userA,
      );
      const where = prisma.timeEntry.findMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe('tenant-A');
      expect(where.billable).toBe(true);
    });
  });

  describe('billingDetail', () => {
    it('refuse si companyId hors tenant', async () => {
      prisma.company.findFirst.mockResolvedValue(null);
      await expect(service.billingDetail(
        { companyId: 'co-X', from: '2026-01-01', to: '2026-01-31' },
        userA,
      )).rejects.toThrow();
    });

    it('autorise si companyId dans tenant + filtre tenantId', async () => {
      prisma.company.findFirst.mockResolvedValue({ id: 'co-1' });
      await service.billingDetail(
        { companyId: 'co-1', from: '2026-01-01', to: '2026-01-31' },
        userA,
      );
      const where = prisma.timeEntry.findMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe('tenant-A');
    });
  });
});
