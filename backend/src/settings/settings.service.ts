import { Injectable, Logger, OnModuleInit, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { SETTINGS_DEFS, findSettingDef } from './settings.seed';

const SECRET_MASK = '********';

// MULTI-TENANT : chaque tenant a son propre jeu de settings (sa cle OpenAI,
// son SMTP, son IMAP, ses defauts profitability...). Les rows existantes
// sont rattachees au tenant 'mdo' au seed retro-compat. Pour un nouveau
// tenant, le seed cree les defauts a la creation du tenant (cf seedForTenant).
//
// La cle de cache inclut le tenantId pour ne pas melanger les valeurs
// entre tenants (sinon un tenant lirait la valeur cachee d'un autre).
//
// Compatibilite legacy : les appels get(key) sans tenantId continuent de
// fonctionner et lisent un setting global (tenantId=null). Utile pour les
// crons / jobs qui n'ont pas de contexte tenant. Pour les nouveaux usages,
// passer toujours le tenantId.
const SETTING_TTL_SECONDS = 60;
const CACHE_KEY = (tenantId: string | null, key: string) =>
  `settings:${tenantId ?? 'global'}:${key}`;

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async onModuleInit() {
    // Au boot : verifie que les settings de SETTINGS_DEFS existent au moins
    // au niveau global (tenantId=null) avec les defauts. Le seed initial
    // d'un nouveau tenant se fait via seedForTenant().
    for (const def of SETTINGS_DEFS) {
      const existing = await this.prisma.setting.findFirst({
        where: { tenantId: null, key: def.key },
      });
      if (existing) continue;
      const envValue = def.envVar ? process.env[def.envVar] : undefined;
      const value = envValue ?? def.defaultValue ?? null;
      await this.prisma.setting.create({
        data: {
          tenantId: null,
          key: def.key,
          value,
          isSecret: def.isSecret ?? false,
          category: def.category,
          label: def.label,
          description: def.description,
        },
      });
    }
    this.logger.log(SETTINGS_DEFS.length + ' settings disponibles au niveau global');
  }

  // Seed les settings par defaut pour un tenant (a appeler a la creation
  // d'un tenant). Idempotent : ne touche pas les valeurs deja personnalisees.
  async seedForTenant(tenantId: string) {
    for (const def of SETTINGS_DEFS) {
      const existing = await this.prisma.setting.findFirst({
        where: { tenantId, key: def.key },
      });
      if (existing) continue;
      await this.prisma.setting.create({
        data: {
          tenantId,
          key: def.key,
          value: def.defaultValue ?? null,
          isSecret: def.isSecret ?? false,
          category: def.category,
          label: def.label,
          description: def.description,
        },
      });
    }
  }

  // Lit la valeur du setting pour le tenant courant. Cascade :
  //   1. Setting du tenant (tenantId = X)
  //   2. Setting global (tenantId = null) — fallback UNIQUEMENT pour les non-
  //      secrets. Pour les secrets (cles API, mots de passe), JAMAIS de
  //      fallback global au profit d'un tenant : sinon Mairie de Seysses
  //      utiliserait la cle OpenAI de MDO, factures sur compte MDO -> drame.
  //   3. ENV var de la def (compatibilite legacy single-instance MDO)
  //   4. defaultValue de la def
  async get(key: string, tenantId: string | null = null): Promise<string | null> {
    return this.cache.getOrSet<string | null>(
      CACHE_KEY(tenantId, key),
      SETTING_TTL_SECONDS,
      async () => {
        const def = findSettingDef(key);
        const isSecret = def?.isSecret === true;
        // 1. Lookup tenant-specific
        if (tenantId) {
          const tenantRow = await this.prisma.setting.findFirst({
            where: { tenantId, key },
          });
          if (tenantRow?.value && tenantRow.value !== '') return tenantRow.value;
          // Pour un secret + tenant != null : on s'arrete ici. Le tenant
          // n'a pas configure son propre secret, on retourne null. Pas
          // de fallback global ni env (qui sont la config MDO).
          if (isSecret) return null;
        }
        // 2. Lookup global (uniquement pour non-secrets, ou tenantId=null)
        const globalRow = await this.prisma.setting.findFirst({
          where: { tenantId: null, key },
        });
        if (globalRow?.value && globalRow.value !== '') return globalRow.value;
        // 3-4. Fallback def (ENV + default) — uniquement pour non-secrets en multi-tenant
        if (isSecret && tenantId) return null;
        if (def?.envVar && process.env[def.envVar]) return process.env[def.envVar] as string;
        return def?.defaultValue ?? null;
      },
    );
  }

  async getBool(key: string, tenantId: string | null = null): Promise<boolean> {
    const v = await this.get(key, tenantId);
    return v === 'true' || v === '1';
  }

  async getInt(key: string, fallback = 0, tenantId: string | null = null): Promise<number> {
    const v = await this.get(key, tenantId);
    if (!v) return fallback;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? fallback : n;
  }

  async listForAdmin(tenantId: string | null = null) {
    // On liste les settings du tenant (avec fallback sur les valeurs globales
    // pour les keys non surchargees). Cote UI, l'admin tenant voit un set
    // complet et peut surcharger.
    const tenantRows = tenantId
      ? await this.prisma.setting.findMany({ where: { tenantId }, orderBy: { key: 'asc' } })
      : [];
    const globalRows = await this.prisma.setting.findMany({
      where: { tenantId: null },
      orderBy: { key: 'asc' },
    });
    const byKey = new Map<string, typeof globalRows[number]>();
    for (const r of globalRows) byKey.set(r.key, r);
    for (const r of tenantRows) byKey.set(r.key, r);

    const enriched = Array.from(byKey.values()).map((s) => {
      const def = findSettingDef(s.key);
      return {
        key: s.key,
        category: s.category,
        label: s.label ?? def?.label ?? s.key,
        description: s.description ?? def?.description,
        isSecret: s.isSecret,
        value: s.isSecret ? null : s.value,
        isSet: s.isSecret ? Boolean(s.value && s.value.length > 0) : Boolean(s.value),
        envFallback: def?.envVar ? Boolean(process.env[def.envVar]) : false,
        updatedAt: s.updatedAt,
        // Indique si la valeur vient du global ou du tenant (utile UI)
        scope: s.tenantId === tenantId ? 'tenant' : 'global',
      };
    });

    const categories: Record<string, typeof enriched> = {};
    for (const s of enriched) {
      if (!categories[s.category]) categories[s.category] = [] as any;
      (categories[s.category] as any).push(s);
    }
    return categories;
  }

  async update(
    key: string,
    value: string | null,
    userId: string,
    tenantId: string | null = null,
  ) {
    const def = findSettingDef(key);
    if (!def) throw new NotFoundException('Setting inconnu : ' + key);
    if (def.isSecret && value === SECRET_MASK) return { key, unchanged: true };
    const stored = value && value.trim() !== '' ? value : null;
    // Upsert sur (tenantId, key) : cree si inexistant, met a jour sinon.
    await this.prisma.setting.upsert({
      where: { tenantId_key: { tenantId: tenantId as any, key } },
      create: {
        tenantId,
        key,
        value: stored,
        isSecret: def.isSecret ?? false,
        category: def.category,
        label: def.label,
        description: def.description,
        updatedById: userId,
      },
      update: { value: stored, updatedById: userId },
    });
    this.cache.del(CACHE_KEY(tenantId, key));
    // Invalide aussi le cache global au cas ou le caller bascule
    this.cache.del(CACHE_KEY(null, key));
    return { key, isSet: Boolean(stored) };
  }
}
