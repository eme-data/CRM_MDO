import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../common/cache/cache.service';

// Vague 10 : tests d'isolation tenant sur le SettingsService.
// Couvre la cascade tenant -> global et la regle critique "pas de fallback
// sur global pour les secrets" (sans laquelle un tenant client utiliserait
// les credentials MDO).

describe('SettingsService — isolation tenant', () => {
  let service: SettingsService;
  let prisma: any;
  let cache: jest.Mocked<CacheService>;

  beforeEach(async () => {
    prisma = {
      setting: {
        findFirst: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
    };
    cache = {
      // Bypass du cache : on appele directement le loader pour tester la
      // cascade. Sinon on testerait juste le cache, pas la logique metier.
      getOrSet: jest.fn().mockImplementation(async (_k: string, _ttl: number, fn: () => Promise<any>) => fn()),
      del: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  describe('get — cascade non-secret', () => {
    it('retourne la valeur du tenant si elle est definie', async () => {
      prisma.setting.findFirst.mockImplementation(({ where }: any) => {
        if (where.tenantId === 'tenant-A') return { value: 'val-A' };
        return null;
      });
      const v = await service.get('lookup.pappersApiKey', 'tenant-A');
      expect(v).toBe('val-A');
    });

    it('fallback sur le global pour un non-secret quand le tenant ne l\'a pas defini', async () => {
      // 1er appel = lookup tenant (null), 2e appel = lookup global (avec valeur)
      prisma.setting.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ value: 'val-global' });
      const v = await service.get('auth.mfaRequiredRoles', 'tenant-A');
      expect(v).toBe('val-global');
    });

    it('retourne le defaultValue de la def quand ni tenant ni global ni env', async () => {
      prisma.setting.findFirst.mockResolvedValue(null);
      // auth.passwordMinLength a defaultValue '12' dans SETTINGS_DEFS
      const v = await service.get('auth.passwordMinLength', 'tenant-A');
      expect(v).toBe('12');
    });
  });

  describe('get — isolation des secrets', () => {
    it('NE fallback PAS sur le global pour un secret quand le tenant n\'a pas defini son propre secret', async () => {
      // ai.openaiApiKey est isSecret:true dans SETTINGS_DEFS
      prisma.setting.findFirst.mockImplementation(({ where }: any) => {
        if (where.tenantId === 'tenant-mairie-seysses') return null; // pas configure
        if (where.tenantId === null) return { value: 'sk-MDO-SECRET-ne-doit-pas-fuiter' };
        return null;
      });
      const v = await service.get('ai.openaiApiKey', 'tenant-mairie-seysses');
      // CRITIQUE : sinon Mairie de Seysses utiliserait la cle OpenAI de MDO
      // (factures sur compte MDO).
      expect(v).toBeNull();
    });

    it('retourne le secret du tenant si defini chez lui', async () => {
      prisma.setting.findFirst.mockImplementation(({ where }: any) => {
        if (where.tenantId === 'tenant-mairie-seysses') return { value: 'sk-seysses-own-key' };
        return null;
      });
      const v = await service.get('ai.openaiApiKey', 'tenant-mairie-seysses');
      expect(v).toBe('sk-seysses-own-key');
    });

    it('en mode global (tenantId=null), un secret PEUT lire le global (compat legacy MDO)', async () => {
      prisma.setting.findFirst.mockImplementation(({ where }: any) => {
        if (where.tenantId === null) return { value: 'sk-MDO-legacy' };
        return null;
      });
      const v = await service.get('ai.openaiApiKey', null);
      expect(v).toBe('sk-MDO-legacy');
    });

    it('ignore les valeurs vides ("") cote tenant et fallback (non-secret)', async () => {
      prisma.setting.findFirst
        .mockResolvedValueOnce({ value: '' }) // tenant a une row mais value vide
        .mockResolvedValueOnce({ value: 'val-global' });
      const v = await service.get('auth.mfaRequiredRoles', 'tenant-A');
      expect(v).toBe('val-global');
    });
  });

  describe('update', () => {
    it('upsert sur la cle compound (tenantId, key) — un tenant ne peut pas ecraser un autre', async () => {
      prisma.setting.upsert.mockResolvedValue({});
      await service.update('lookup.pappersApiKey', 'val', 'user-1', 'tenant-A');
      expect(prisma.setting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_key: { tenantId: 'tenant-A', key: 'lookup.pappersApiKey' } },
          create: expect.objectContaining({ tenantId: 'tenant-A' }),
        }),
      );
    });

    it('invalide les caches tenant ET global apres update', async () => {
      prisma.setting.upsert.mockResolvedValue({});
      await service.update('lookup.pappersApiKey', 'val', 'user-1', 'tenant-A');
      expect(cache.del).toHaveBeenCalledWith('settings:tenant-A:lookup.pappersApiKey');
      expect(cache.del).toHaveBeenCalledWith('settings:global:lookup.pappersApiKey');
    });

    it('rejette une cle inconnue (non listee dans SETTINGS_DEFS)', async () => {
      await expect(
        service.update('cle.inexistante', 'val', 'user-1', 'tenant-A'),
      ).rejects.toThrow();
    });
  });
});
