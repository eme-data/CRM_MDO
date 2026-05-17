import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

// Tests anti-regression du fix 2e573aa (audit pass 1, 2026-05-17).
// Le service exposait KBIS/contrats/PDFs clients en lecture cross-tenant
// via findUnique(id) sans filtre tenantId. Verifie maintenant :
//   - listForCompany : assertCompanyInTenant + WHERE tenantId
//   - findById : scopedWhere (tenantId injecte sauf super-admin)
//   - upload : assertCompanyInTenant + herite tenantId de la company
//   - update / remove : passent par findById qui assert

describe('DocumentsService — tenant isolation', () => {
  let service: DocumentsService;
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
      companyDocument: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      company: { findFirst: jest.fn(), findUnique: jest.fn() },
    };
    scope = new TenantScope(prisma);
    service = new DocumentsService(
      {} as any, // configService
      prisma,
      {} as any, // notifications
      scope,
    );
  });

  describe('listForCompany', () => {
    it('refuse (Forbidden) si companyId hors tenant', async () => {
      prisma.company.findFirst.mockResolvedValue(null);
      await expect(service.listForCompany('co-X', {}, userA))
        .rejects.toThrow(ForbiddenException);
    });

    it('autorise si companyId dans le tenant', async () => {
      prisma.company.findFirst.mockResolvedValue({ id: 'co-1' });
      prisma.companyDocument.findMany.mockResolvedValue([]);
      await service.listForCompany('co-1', {}, userA);
      expect(prisma.companyDocument.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'co-1' }),
        }),
      );
    });

    it('me=null : bypass assert (cas portail client, gere ailleurs)', async () => {
      prisma.companyDocument.findMany.mockResolvedValue([]);
      await service.listForCompany('co-1', {});
      // me undefined -> pas d'assert tenant, pas de query company
      expect(prisma.company.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('scope par tenantId via scopedWhere pour user normal', async () => {
      prisma.companyDocument.findFirst.mockResolvedValue({ id: 'd-1' });
      await service.findById('d-1', userA);
      const where = prisma.companyDocument.findFirst.mock.calls[0][0].where;
      expect(where).toEqual({ id: 'd-1', tenantId: 'tenant-A' });
    });

    it('throw 404 si document hors tenant', async () => {
      prisma.companyDocument.findFirst.mockResolvedValue(null);
      await expect(service.findById('d-X', userA))
        .rejects.toThrow(NotFoundException);
    });

    it('super-admin : pas de filtre tenantId', async () => {
      prisma.companyDocument.findFirst.mockResolvedValue({ id: 'd-1' });
      await service.findById('d-1', superAdmin);
      const where = prisma.companyDocument.findFirst.mock.calls[0][0].where;
      expect(where).toEqual({ id: 'd-1' });
    });

    it('me=null : bypass scope (cas portail client)', async () => {
      prisma.companyDocument.findFirst.mockResolvedValue({ id: 'd-1' });
      await service.findById('d-1');
      const where = prisma.companyDocument.findFirst.mock.calls[0][0].where;
      expect(where).toEqual({ id: 'd-1' });
    });
  });
});
