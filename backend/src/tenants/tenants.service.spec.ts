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

  // ============================================================
  // Vague 13b : RGPD purge (article 17 - droit a l'effacement)
  // ============================================================
  describe('purge (RGPD)', () => {
    beforeEach(() => {
      // Stubs pour tous les deleteMany appeles par purge() (ordre indifferent).
      const models = [
        'aiUsage', 'activity', 'notification', 'pushSubscription', 'callLog',
        'signatureRequest', 'emailSecurityCheck', 'webhookEndpoint',
        'customerSuccessReview', 'clientReport', 'bankTransaction',
        'complianceAssessment', 'phishingCampaign', 'onboardingRun',
        'onboardingTemplate', 'dripCampaign', 'backupJob', 'uptimeMonitor',
        'apiKey', 'kbArticle', 'subprocessor', 'responseTemplate',
        'emailTemplate', 'workflowRule', 'recurringTaskTemplate', 'task',
        'note', 'quickNote', 'runbookRun', 'docPage', 'secretEntry',
        'flexibleAsset', 'network', 'location', 'asset', 'companyDocument',
        'attachment', 'timeEntry', 'intervention', 'ticketMessage', 'ticket',
        'invoiceLine', 'invoice', 'quoteLine', 'quote', 'contract',
        'opportunity', 'contact', 'company', 'setting', 'clientPortalUser',
        'refreshToken', 'userSkill', 'user',
      ];
      for (const m of models) {
        prisma[m] = prisma[m] ?? {};
        prisma[m].deleteMany = jest.fn().mockResolvedValue({ count: 0 });
      }
      prisma.user.findMany = jest.fn().mockResolvedValue([]);
    });

    it('refuse de purger le tenant mdo (instance root)', async () => {
      prisma.tenant.findUnique.mockResolvedValue(tenantMdo);
      await expect(service.purge('t-mdo', 'mdo', 'user-S')).rejects.toThrow(BadRequestException);
      expect(prisma.tenant.delete).not.toHaveBeenCalled();
    });

    it('REJETTE si le confirmSlug ne matche pas le slug du tenant (anti accident)', async () => {
      prisma.tenant.findUnique.mockResolvedValue(tenantSeysses);
      await expect(service.purge('t-seysses', 'mauvais-slug', 'user-S')).rejects.toThrow(BadRequestException);
      // Aucune suppression n'a eu lieu
      expect(prisma.tenant.delete).not.toHaveBeenCalled();
      expect(prisma.user.deleteMany).not.toHaveBeenCalled();
    });

    it('execute la purge complete quand confirmSlug correct', async () => {
      prisma.tenant.findUnique.mockResolvedValue(tenantSeysses);
      prisma.tenant.delete.mockResolvedValue(tenantSeysses);
      prisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
      prisma.user.deleteMany.mockResolvedValue({ count: 2 });
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 5 });
      prisma.company.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.purge('t-seysses', 'seysses', 'user-S');

      // Tenant supprime apres les enfants
      expect(prisma.tenant.delete).toHaveBeenCalledWith({ where: { id: 't-seysses' } });
      // Suppressions cascade tracees dans le resultat
      expect(result.deleted.users).toBe(2);
      expect(result.deleted.refreshTokens).toBe(5);
      expect(result.deleted.companies).toBe(3);
    });

    it('refreshTokens supprimes via userId si users existent (avant delete user)', async () => {
      prisma.tenant.findUnique.mockResolvedValue(tenantSeysses);
      prisma.tenant.delete.mockResolvedValue(tenantSeysses);
      prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
      prisma.user.deleteMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });

      await service.purge('t-seysses', 'seysses', 'user-S');

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: { in: ['u1'] } },
      });
    });
  });

  // ============================================================
  // Vague 13b : RGPD export (article 20 - portabilite)
  // ============================================================
  describe('export (RGPD)', () => {
    beforeEach(() => {
      // Stubs findMany pour tous les modeles exports
      const models = [
        'user', 'company', 'contact', 'contract', 'opportunity', 'quote',
        'quoteLine', 'invoice', 'invoiceLine', 'ticket', 'ticketMessage',
        'intervention', 'timeEntry', 'attachment', 'companyDocument',
        'asset', 'location', 'network', 'flexibleAsset', 'docPage',
        'quickNote', 'runbookRun', 'secretEntry', 'setting', 'activity',
        'note', 'task', 'recurringTaskTemplate', 'workflowRule',
        'emailTemplate', 'responseTemplate', 'subprocessor', 'kbArticle',
        'aiUsage', 'apiKey', 'onboardingTemplate', 'onboardingRun',
        'uptimeMonitor', 'backupJob', 'dripCampaign', 'phishingCampaign',
        'complianceAssessment', 'notification', 'bankTransaction',
        'clientReport', 'customerSuccessReview', 'webhookEndpoint',
        'emailSecurityCheck', 'signatureRequest', 'callLog', 'pushSubscription',
        'clientPortalUser',
      ];
      for (const m of models) {
        prisma[m] = prisma[m] ?? {};
        prisma[m].findMany = jest.fn().mockResolvedValue([]);
      }
    });

    it('renvoie un dump structure avec meta + toutes les entites', async () => {
      prisma.tenant.findUnique.mockResolvedValue(tenantSeysses);
      prisma.company.findMany.mockResolvedValue([{ id: 'co-1', name: 'Mairie' }]);

      const dump = await service.export('t-seysses');

      expect(dump.meta.tenantSlug).toBe('seysses');
      expect(dump.meta.format).toBe('crm-mdo-tenant-export/v1');
      expect(dump.meta.gdprArticle).toContain('20');
      expect(dump.tenant.id).toBe('t-seysses');
      expect(dump.companies).toEqual([{ id: 'co-1', name: 'Mairie' }]);
    });

    it('filtre TOUTES les findMany par tenantId (isolation)', async () => {
      prisma.tenant.findUnique.mockResolvedValue(tenantSeysses);
      await service.export('t-seysses');
      // On verifie qu'au moins quelques findMany critiques ont bien tenantId='t-seysses'
      expect(prisma.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 't-seysses' } }),
      );
      expect(prisma.secretEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 't-seysses' } }),
      );
      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 't-seysses' } }),
      );
    });
  });
});
