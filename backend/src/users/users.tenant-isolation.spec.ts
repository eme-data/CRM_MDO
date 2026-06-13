import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

// Tests anti-regression : cassent si un futur commit re-introduit le leak
// multi-tenant corrige le 2026-06-13 (users.service etait entierement non scope :
// list() global, findById/update/remove/resetPassword par id seul -> IDOR, dont
// le RESET DE MOT DE PASSE cross-tenant). Cf [[tenant-scope-audit]].

describe('UsersService — tenant isolation', () => {
  let service: UsersService;
  let prisma: any;
  let settings: any;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      refreshToken: { updateMany: jest.fn() },
      $transaction: jest.fn(),
    };
    settings = { get: jest.fn().mockResolvedValue('12') };
    service = new UsersService(prisma, settings);
  });

  describe('list', () => {
    it('filtre par tenantId', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.list('tenant-A');
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-A' } }),
      );
    });

    it('super-admin (tenantId null) : aucun filtre tenant', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.list(null);
      expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({});
    });
  });

  describe('findById', () => {
    it('scope le findFirst par id ET tenantId', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u-1' });
      await service.findById('u-1', 'tenant-A');
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'u-1', tenantId: 'tenant-A' }),
        }),
      );
    });

    it('refuse (404) un user d\'un autre tenant', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.findById('u-X', 'tenant-A')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resetPassword', () => {
    it('refuse de reset le mot de passe d\'un user d\'un autre tenant (IDOR critique)', async () => {
      prisma.user.findFirst.mockResolvedValue(null); // wrong tenant
      await expect(service.resetPassword('u-X', 'NewStrongPass123!', 'tenant-A'))
        .rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('refuse de desactiver un user d\'un autre tenant', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.remove('u-X', 'me', 'tenant-A')).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('garde-fou dernier ADMIN : le count est scope par tenant', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u-1', role: 'ADMIN' });
      prisma.user.count.mockResolvedValue(1); // un autre admin existe dans le tenant
      prisma.$transaction.mockResolvedValue(undefined);
      await service.remove('u-1', 'me', 'tenant-A');
      expect(prisma.user.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'ADMIN', tenantId: 'tenant-A' }),
        }),
      );
    });
  });
});
