import { ExecutiveService } from './executive.service';

// Tests anti-regression du fix 2026-06-13 : executive.snapshot agregait MRR/ARR/
// churn de TOUS les tenants et, pire, mettait en cache sous une cle GLOBALE
// (un tenant pouvait servir le snapshot d'un autre). Verifie le scope des
// requetes ET la cle de cache par tenant.

describe('ExecutiveService — tenant isolation', () => {
  let service: ExecutiveService;
  let prisma: any;
  let cache: any;

  beforeEach(() => {
    prisma = {
      contract: { findMany: jest.fn().mockResolvedValue([]) },
      company: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      opportunity: { findMany: jest.fn().mockResolvedValue([]) },
      quote: { aggregate: jest.fn().mockResolvedValue({ _sum: { totalTtc: null } }) },
    };
    cache = { get: jest.fn().mockReturnValue(undefined), set: jest.fn() };
    service = new ExecutiveService(prisma, cache);
  });

  it('scope les contrats par tenantId', async () => {
    await service.snapshot('tenant-A');
    const where = prisma.contract.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('tenant-A');
  });

  it('utilise une cle de cache PAR tenant (pas de contamination inter-tenant)', async () => {
    await service.snapshot('tenant-A');
    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining('tenant-A'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('super-admin (null) : pas de filtre tenant + cle de cache distincte', async () => {
    await service.snapshot(null);
    const where = prisma.contract.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('tenantId');
    const cacheKey = cache.set.mock.calls[0][0];
    expect(cacheKey).not.toContain('tenant-A');
  });
});
