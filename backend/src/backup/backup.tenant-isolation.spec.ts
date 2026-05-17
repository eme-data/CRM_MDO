import { NotFoundException } from '@nestjs/common';
import { BackupService } from './backup.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

// Tests anti-regression du fix c61ab22 (audit pass 1, 2026-05-17).
// BackupJob.tenantId existait dans le schema mais n'etait ni rempli a
// la creation ni utilise en WHERE. Un ADMIN/MANAGER du tenant A pouvait
// list/create/delete les jobs du tenant B.

describe('BackupService — tenant isolation', () => {
  let service: BackupService;
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
      backupJob: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      company: { findFirst: jest.fn(), findUnique: jest.fn() },
    };
    scope = new TenantScope(prisma);
    service = new BackupService(prisma, {} as any, scope);
  });

  describe('list', () => {
    it('filtre par tenantId pour user normal', async () => {
      prisma.backupJob.findMany.mockResolvedValue([]);
      await service.list(userA);
      expect(prisma.backupJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-A' }),
        }),
      );
    });

    it('super-admin : pas de filtre tenantId', async () => {
      prisma.backupJob.findMany.mockResolvedValue([]);
      await service.list(superAdmin);
      const where = prisma.backupJob.findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('tenantId');
    });
  });

  describe('findOne', () => {
    it('throw 404 si job hors tenant', async () => {
      prisma.backupJob.findFirst.mockResolvedValue(null);
      await expect(service.findOne('job-X', userA))
        .rejects.toThrow(NotFoundException);
      expect(prisma.backupJob.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'job-X', tenantId: 'tenant-A' }),
        }),
      );
    });
  });

  describe('create', () => {
    it('refuse si companyId hors tenant (via assertCompanyInTenant)', async () => {
      prisma.company.findFirst.mockResolvedValue(null);
      await expect(service.create(
        { companyId: 'co-X', name: 'Test' },
        userA,
      )).rejects.toThrow();
    });

    it('herite tenantId de la company', async () => {
      prisma.company.findFirst.mockResolvedValue({ id: 'co-1' });
      prisma.company.findUnique.mockResolvedValue({ tenantId: 'tenant-A' });
      prisma.backupJob.create.mockResolvedValue({ id: 'job-1' });
      await service.create({ companyId: 'co-1', name: 'Test' }, userA);
      const createData = prisma.backupJob.create.mock.calls[0][0].data;
      expect(createData.tenantId).toBe('tenant-A');
      expect(createData.companyId).toBe('co-1');
    });
  });

  describe('stats', () => {
    it('filtre par tenantId', async () => {
      prisma.backupJob.findMany.mockResolvedValue([]);
      await service.stats(userA);
      const where = prisma.backupJob.findMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe('tenant-A');
      expect(where.isActive).toBe(true);
    });
  });
});
