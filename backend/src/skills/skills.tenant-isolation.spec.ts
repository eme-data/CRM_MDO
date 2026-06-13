import { SkillsService } from './skills.service';

// Anti-regression du fix 2026-06-13 : matrix/expiringSoon/listForUser leakaient
// les users et certifs (UserSkill) de tous les tenants. Le scope se fait sur
// user.tenantId directement ou via la relation user (UserSkill n'a pas de tenantId).

describe('SkillsService — tenant isolation', () => {
  let service: SkillsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      skill: { findMany: jest.fn().mockResolvedValue([]) },
      userSkill: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new SkillsService(prisma);
  });

  describe('matrix', () => {
    it('scope users (direct) et userSkills (via relation user)', async () => {
      await service.matrix('tenant-A');
      expect(prisma.user.findMany.mock.calls[0][0].where.tenantId).toBe('tenant-A');
      expect(prisma.userSkill.findMany.mock.calls[0][0].where).toEqual({ user: { tenantId: 'tenant-A' } });
    });

    it('super-admin (null) : pas de filtre', async () => {
      await service.matrix(null);
      expect(prisma.user.findMany.mock.calls[0][0].where).not.toHaveProperty('tenantId');
      expect(prisma.userSkill.findMany.mock.calls[0][0].where).toBeUndefined();
    });
  });

  describe('expiringSoon', () => {
    it('scope les certifs via la relation user', async () => {
      await service.expiringSoon('tenant-A');
      expect(prisma.userSkill.findMany.mock.calls[0][0].where.user).toEqual({ tenantId: 'tenant-A' });
    });
  });

  describe('listForUser', () => {
    it('scope par userId ET relation user.tenantId', async () => {
      await service.listForUser('u-1', 'tenant-A');
      const where = prisma.userSkill.findMany.mock.calls[0][0].where;
      expect(where.userId).toBe('u-1');
      expect(where.user).toEqual({ tenantId: 'tenant-A' });
    });
  });
});
