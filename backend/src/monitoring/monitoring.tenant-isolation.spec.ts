import { MonitoringService } from './monitoring.service';

// Anti-regression du fix 2026-06-13 : overview() agregait les certificats/domaines
// (asset) de tous les tenants. Verifie le scope par tenantId + bypass super-admin.

describe('MonitoringService — tenant isolation', () => {
  let service: MonitoringService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      asset: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new MonitoringService(prisma, {} as any, {} as any);
  });

  it('scope les requetes asset par tenantId', async () => {
    await service.overview('tenant-A');
    expect(prisma.asset.count.mock.calls[0][0].where.tenantId).toBe('tenant-A');
    expect(prisma.asset.findMany.mock.calls[0][0].where.tenantId).toBe('tenant-A');
  });

  it('super-admin (null) : pas de filtre tenant', async () => {
    await service.overview(null);
    expect(prisma.asset.count.mock.calls[0][0].where).not.toHaveProperty('tenantId');
    expect(prisma.asset.findMany.mock.calls[0][0].where).not.toHaveProperty('tenantId');
  });
});
