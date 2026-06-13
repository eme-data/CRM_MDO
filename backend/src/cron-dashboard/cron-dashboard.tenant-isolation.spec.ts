import { CronDashboardService } from './cron-dashboard.service';

// Anti-regression du fix 2026-06-13 : history() listait les activites CRON_TRIGGER
// de tous les tenants. Verifie le scope par tenantId + bypass super-admin.

describe('CronDashboardService — tenant isolation', () => {
  let service: CronDashboardService;
  let prisma: any;

  beforeEach(() => {
    prisma = { activity: { findMany: jest.fn().mockResolvedValue([]) } };
    service = new CronDashboardService({} as any, prisma);
  });

  it('history scope par tenantId', async () => {
    await service.history('tenant-A');
    expect(prisma.activity.findMany.mock.calls[0][0].where.tenantId).toBe('tenant-A');
  });

  it('super-admin (null) : pas de filtre tenant', async () => {
    await service.history(null);
    expect(prisma.activity.findMany.mock.calls[0][0].where).not.toHaveProperty('tenantId');
  });
});
