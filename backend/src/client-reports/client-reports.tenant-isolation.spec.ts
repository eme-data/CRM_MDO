import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ClientReportsService } from './client-reports.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

// Tests de garde anti-regression : si ces tests cassent, c'est qu'un
// futur commit a re-introduit un leak multi-tenant sur client-reports.
// Le fix initial est dans commit b4f9bb0 (audit pass 1, 2026-05-17).
//
// On verifie pour chaque methode appelee par l'API que :
// - la WHERE clause inclut tenantId (ou utilise TenantScope helper)
// - super-admin bypass via scopedWhere = {} retourne sans filter tenant

describe('ClientReportsService — tenant isolation', () => {
  let service: ClientReportsService;
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
    prisma = {
      clientReport: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      company: { findFirst: jest.fn() },
    };
    scope = new TenantScope(prisma);

    // Wire up le service avec deps minimales (autres deps non utilisees par
    // les methodes testees ici).
    service = new ClientReportsService(
      prisma,
      {} as any, // pdf
      {} as any, // mail
      {} as any, // settings
      {} as any, // config
      {} as any, // cyber
      {} as any, // health
      scope,
    );
  });

  describe('listAll', () => {
    it('filtre par tenantId pour un user normal', async () => {
      prisma.clientReport.findMany.mockResolvedValue([]);
      await service.listAll({}, userA);
      expect(prisma.clientReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-A' }),
        }),
      );
    });

    it('NE filtre PAS par tenantId pour un super-admin', async () => {
      prisma.clientReport.findMany.mockResolvedValue([]);
      await service.listAll({}, superAdmin);
      const callArg = prisma.clientReport.findMany.mock.calls[0][0];
      expect(callArg.where).not.toHaveProperty('tenantId');
    });

    it('users de tenants distincts -> wheres distincts', async () => {
      prisma.clientReport.findMany.mockResolvedValue([]);
      await service.listAll({}, userA);
      await service.listAll({}, userB);
      const w1 = prisma.clientReport.findMany.mock.calls[0][0].where;
      const w2 = prisma.clientReport.findMany.mock.calls[1][0].where;
      expect(w1.tenantId).toBe('tenant-A');
      expect(w2.tenantId).toBe('tenant-B');
    });
  });

  describe('listForCompany', () => {
    it('assertCompanyInTenant : refuse si company hors tenant', async () => {
      // Le helper TenantScope va trouver 0 company dans tenant-A pour co-X
      prisma.company.findFirst.mockResolvedValue(null);
      await expect(service.listForCompany('co-X', userA)).rejects.toThrow(ForbiddenException);
    });

    it('autorise si company dans le tenant courant', async () => {
      prisma.company.findFirst.mockResolvedValue({ id: 'co-1' });
      prisma.clientReport.findMany.mockResolvedValue([]);
      await expect(service.listForCompany('co-1', userA)).resolves.toEqual([]);
      // Et le findMany filtre bien par tenantId aussi
      expect(prisma.clientReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-A', companyId: 'co-1' }),
        }),
      );
    });

    it('super-admin bypass assertCompanyInTenant ET findMany sans tenantId', async () => {
      prisma.clientReport.findMany.mockResolvedValue([]);
      await service.listForCompany('co-any', superAdmin);
      // assertCompanyInTenant bypass : pas de query company
      expect(prisma.company.findFirst).not.toHaveBeenCalled();
      // findMany sans filtre tenantId
      const where = prisma.clientReport.findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('tenantId');
    });
  });

  describe('findById', () => {
    it('refuse (404) si rapport dans un autre tenant', async () => {
      // findFirst({ where: { id, tenantId } }) renvoie null car wrong tenant
      prisma.clientReport.findFirst.mockResolvedValue(null);
      await expect(service.findById('rep-X', userA)).rejects.toThrow(NotFoundException);
      // CRITIQUE : verifier que la WHERE contient tenantId (sinon serait
      // accessible cross-tenant en bypass).
      expect(prisma.clientReport.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: 'rep-X', tenantId: 'tenant-A' }),
      });
    });

    it('retourne le rapport si dans le bon tenant', async () => {
      const rep = { id: 'rep-1', tenantId: 'tenant-A', companyId: 'co-1' };
      prisma.clientReport.findFirst.mockResolvedValue(rep);
      await expect(service.findById('rep-1', userA)).resolves.toBe(rep);
    });

    it('super-admin : findFirst SANS tenantId (acces total)', async () => {
      prisma.clientReport.findFirst.mockResolvedValue({ id: 'rep-X' });
      await service.findById('rep-X', superAdmin);
      const where = prisma.clientReport.findFirst.mock.calls[0][0].where;
      expect(where).toEqual({ id: 'rep-X' });
    });
  });

  describe('remove', () => {
    it('refuse de supprimer un rapport d\'un autre tenant', async () => {
      prisma.clientReport.findFirst.mockResolvedValue(null);
      await expect(service.remove('rep-X', userA)).rejects.toThrow(NotFoundException);
      expect(prisma.clientReport.delete).not.toHaveBeenCalled();
    });
  });
});
