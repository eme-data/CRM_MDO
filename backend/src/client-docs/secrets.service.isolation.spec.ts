import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SecretsService } from './secrets.service';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

// Tests d'isolation cross-tenant sur le service le plus sensible (vague
// 11A CRITIQUE MAX) : SecretEntry stocke des mots de passe dechiffres a
// la demande. Avant fix, un user du tenant A pouvait deviner un UUID et
// dechiffrer n'importe quel secret du systeme.

describe('SecretsService — isolation cross-tenant', () => {
  let service: SecretsService;
  let prisma: any;

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

  // Store en memoire keye par id, simule Prisma
  const secretStore = new Map<string, any>();
  const companyStore = new Map<string, any>();

  beforeEach(async () => {
    secretStore.clear();
    companyStore.clear();
    // Seed : une company dans chaque tenant
    companyStore.set('co-A', { id: 'co-A', tenantId: 'tenant-A' });
    companyStore.set('co-B', { id: 'co-B', tenantId: 'tenant-B' });

    prisma = {
      company: {
        findFirst: jest.fn(({ where }: any) => {
          const c = companyStore.get(where.id);
          if (!c) return Promise.resolve(null);
          if (where.tenantId !== undefined && c.tenantId !== where.tenantId) return Promise.resolve(null);
          return Promise.resolve(c);
        }),
      },
      secretEntry: {
        findFirst: jest.fn(({ where }: any) => {
          const s = secretStore.get(where.id);
          if (!s) return Promise.resolve(null);
          if (where.tenantId !== undefined && s.tenantId !== where.tenantId) return Promise.resolve(null);
          return Promise.resolve(s);
        }),
        findMany: jest.fn(({ where }: any) => {
          const items = Array.from(secretStore.values()).filter(
            (s) => s.companyId === where.companyId,
          );
          return Promise.resolve(items);
        }),
        create: jest.fn(({ data }: any) => {
          const id = 'sec-' + (secretStore.size + 1);
          const created = { id, ...data };
          secretStore.set(id, created);
          return Promise.resolve(created);
        }),
        update: jest.fn(({ where, data }: any) => {
          const s = secretStore.get(where.id);
          if (!s) return Promise.resolve(null);
          Object.assign(s, data);
          return Promise.resolve(s);
        }),
        delete: jest.fn(({ where }: any) => {
          secretStore.delete(where.id);
          return Promise.resolve({});
        }),
      },
      activity: { create: jest.fn().mockResolvedValue({}) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SecretsService,
        TenantScope,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: () => 'test-secret-key-for-encryption' } },
      ],
    }).compile();

    service = moduleRef.get(SecretsService);
    service.onModuleInit(); // init masterKey
  });

  describe('Scenario : userA cree un secret dans tenant A', () => {
    let createdId: string;

    beforeEach(async () => {
      const created = await service.create(
        { companyId: 'co-A', label: 'firewall admin', value: 'super-secret-pwd' } as any,
        userA,
      );
      createdId = created.id;
    });

    it('userA peut le reveler', async () => {
      const r = await service.reveal(createdId, userA);
      expect(r.value).toBe('super-secret-pwd');
    });

    it('userB obtient 404 sur reveal (pas Forbidden : pas de revelation d\'existence)', async () => {
      await expect(service.reveal(createdId, userB)).rejects.toThrow(NotFoundException);
    });

    it('userB obtient 404 sur update', async () => {
      await expect(service.update(createdId, { label: 'hack' }, userB)).rejects.toThrow(NotFoundException);
    });

    it('userB obtient 404 sur remove (le secret reste intact)', async () => {
      await expect(service.remove(createdId, userB)).rejects.toThrow(NotFoundException);
      // Le secret est toujours la
      expect(secretStore.has(createdId)).toBe(true);
    });

    it('userB obtient 404 sur getTotp / accessLog', async () => {
      await expect(service.getTotp(createdId, userB)).rejects.toThrow(NotFoundException);
      await expect(service.accessLog(createdId, userB)).rejects.toThrow(NotFoundException);
    });

    it('userB ne peut PAS lister les secrets de la company A (Forbidden sur la company)', async () => {
      await expect(service.listForCompany('co-A', userB)).rejects.toThrow(ForbiddenException);
    });

    it('super-admin peut tout faire (reveal d\'un secret d\'un autre tenant)', async () => {
      const r = await service.reveal(createdId, superAdmin);
      expect(r.value).toBe('super-secret-pwd');
    });
  });

  describe('Scenario : userA tente de creer dans la company de userB', () => {
    it('Forbidden : la company co-B n\'est pas dans le tenant de userA', async () => {
      await expect(
        service.create(
          { companyId: 'co-B', label: 'spy', value: 'x' } as any,
          userA,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Activity log : porte le tenantId du secret', () => {
    it('reveal log activity avec tenantId du secret', async () => {
      const created = await service.create(
        { companyId: 'co-A', label: 'L', value: 'v' } as any,
        userA,
      );
      await service.reveal(created.id, userA);
      // Trouver l'appel REVEAL
      const reveal = prisma.activity.create.mock.calls.find(
        ([arg]: any[]) => arg.data.action === 'REVEAL_SECRET',
      );
      expect(reveal).toBeDefined();
      expect(reveal[0].data.tenantId).toBe('tenant-A');
    });
  });
});
