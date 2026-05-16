import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';

// Vague 10 : tests d'isolation tenant sur le TenantsService.
// Couvre la resolution par domaine (cache, normalisation), le seed retro-compat,
// et les protections sur le tenant 'mdo' (non-suppression).

describe('TenantsService — resolution domaine + cache + protections', () => {
  let service: TenantsService;
  let prisma: any;
  let settings: jest.Mocked<SettingsService>;

  const tenantMdo = {
    id: 't-mdo',
    slug: 'mdo',
    customDomain: 'crm.mdoservices.fr',
    isActive: true,
    brandName: 'MDO',
    brandShortName: 'MDO',
  };
  const tenantSeysses = {
    id: 't-seysses',
    slug: 'seysses',
    customDomain: 'crm.seysses.fr',
    isActive: true,
    brandName: 'Mairie de Seysses',
    brandShortName: 'Seysses',
  };

  beforeEach(async () => {
    prisma = {
      tenant: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      user: { count: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      // updateMany stubs pour onModuleInit, on ne le teste pas ici
    };
    settings = {
      seedForTenant: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();
    service = module.get<TenantsService>(TenantsService);
  });

  describe('resolveByDomain', () => {
    it('retourne null pour un host vide', async () => {
      const r = await service.resolveByDomain('');
      expect(r).toBeNull();
      expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    });

    it('normalise le host (lowercase + retire le port)', async () => {
      prisma.tenant.findUnique.mockResolvedValue(tenantSeysses);
      await service.resolveByDomain('CRM.SEYSSES.FR:8443');
      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { customDomain: 'crm.seysses.fr' },
      });
    });

    it('cache la resolution (2 appels = 1 seul findUnique)', async () => {
      prisma.tenant.findUnique.mockResolvedValue(tenantMdo);
      await service.resolveByDomain('crm.mdoservices.fr');
      await service.resolveByDomain('crm.mdoservices.fr');
      expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(1);
    });

    it('isole bien deux tenants distincts (pas de leak via cache)', async () => {
      prisma.tenant.findUnique.mockImplementation(({ where }: any) => {
        if (where.customDomain === 'crm.mdoservices.fr') return tenantMdo;
        if (where.customDomain === 'crm.seysses.fr') return tenantSeysses;
        return null;
      });
      const a = await service.resolveByDomain('crm.mdoservices.fr');
      const b = await service.resolveByDomain('crm.seysses.fr');
      expect(a?.id).toBe('t-mdo');
      expect(b?.id).toBe('t-seysses');
    });

    it('invalidateCache vide la cle ciblee', async () => {
      prisma.tenant.findUnique.mockResolvedValue(tenantMdo);
      await service.resolveByDomain('crm.mdoservices.fr');
      service.invalidateCache('crm.mdoservices.fr');
      await service.resolveByDomain('crm.mdoservices.fr');
      expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('create', () => {
    it('valide le format du slug (lowercase, [a-z0-9-], 2-31 char)', async () => {
      await expect(
        service.create({
          slug: 'BAD_SLUG',
          customDomain: 'x.fr',
          brandName: 'X',
          brandShortName: 'X',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('cree le tenant et seed les settings par defaut', async () => {
      prisma.tenant.create.mockResolvedValue(tenantSeysses);
      const t = await service.create({
        slug: 'seysses',
        customDomain: 'crm.seysses.fr',
        brandName: 'Mairie de Seysses',
        brandShortName: 'Seysses',
      });
      expect(t.id).toBe('t-seysses');
      expect(settings.seedForTenant).toHaveBeenCalledWith('t-seysses');
    });
  });

  describe('remove', () => {
    it('refuse de supprimer le tenant mdo', async () => {
      prisma.tenant.findUnique.mockResolvedValue(tenantMdo);
      await expect(service.remove('t-mdo')).rejects.toThrow(BadRequestException);
      expect(prisma.tenant.delete).not.toHaveBeenCalled();
    });

    it('refuse si des users existent encore dans le tenant', async () => {
      prisma.tenant.findUnique.mockResolvedValue(tenantSeysses);
      prisma.user.count.mockResolvedValue(3);
      await expect(service.remove('t-seysses')).rejects.toThrow(BadRequestException);
      expect(prisma.tenant.delete).not.toHaveBeenCalled();
    });

    it('supprime le tenant si aucun user', async () => {
      prisma.tenant.findUnique.mockResolvedValue(tenantSeysses);
      prisma.user.count.mockResolvedValue(0);
      prisma.tenant.delete.mockResolvedValue(tenantSeysses);
      await service.remove('t-seysses');
      expect(prisma.tenant.delete).toHaveBeenCalledWith({ where: { id: 't-seysses' } });
    });
  });
});
