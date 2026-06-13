import { SocService } from './soc.service';

// Tests anti-regression du fix 2026-06-13 : la console SOC agregait les alertes
// de 5 sources (M365, uptime, email, compliance, assets) SANS scope tenant ->
// un admin voyait les alertes securite de tous les tenants. Verifie le scope
// (direct pour email/asset, via relation pour m365/uptime/compliance).

describe('SocService — tenant isolation', () => {
  let service: SocService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      m365SecurityAlert: { findMany: jest.fn().mockResolvedValue([]) },
      uptimeIncident: { findMany: jest.fn().mockResolvedValue([]) },
      emailSecurityCheck: { findMany: jest.fn().mockResolvedValue([]) },
      complianceControlAssessment: { findMany: jest.fn().mockResolvedValue([]) },
      asset: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new SocService(prisma);
  });

  it('scope les sources a tenantId direct (email, asset)', async () => {
    await service.listOpen('tenant-A');
    expect(prisma.emailSecurityCheck.findMany.mock.calls[0][0].where.tenantId).toBe('tenant-A');
    expect(prisma.asset.findMany.mock.calls[0][0].where.tenantId).toBe('tenant-A');
  });

  it('scope les sources via relation (m365 -> m365Tenant.tenantId)', async () => {
    await service.listOpen('tenant-A');
    const where = prisma.m365SecurityAlert.findMany.mock.calls[0][0].where;
    expect(where.m365Tenant).toEqual(expect.objectContaining({ tenantId: 'tenant-A' }));
  });

  it('super-admin (null) : aucune source filtree par tenant', async () => {
    await service.listOpen(null);
    expect(prisma.emailSecurityCheck.findMany.mock.calls[0][0].where).not.toHaveProperty('tenantId');
    expect(prisma.asset.findMany.mock.calls[0][0].where).not.toHaveProperty('tenantId');
    expect(prisma.m365SecurityAlert.findMany.mock.calls[0][0].where).not.toHaveProperty('m365Tenant');
  });
});
