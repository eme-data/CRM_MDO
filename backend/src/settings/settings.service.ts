import { Injectable, Logger, OnModuleInit, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SETTINGS_DEFS, findSettingDef, SettingDef } from './settings.seed';

const SECRET_MASK = '********';

@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Seed les settings manquants au demarrage avec la valeur env si disponible.
    for (const def of SETTINGS_DEFS) {
      const existing = await this.prisma.setting.findUnique({ where: { key: def.key } });
      if (existing) continue;
      const envValue = def.envVar ? process.env[def.envVar] : undefined;
      const value = envValue ?? def.defaultValue ?? null;
      await this.prisma.setting.create({
        data: {
          key: def.key,
          value,
          isSecret: def.isSecret ?? false,
          category: def.category,
          label: def.label,
          description: def.description,
        },
      });
    }
    this.logger.log(SETTINGS_DEFS.length + ' settings disponibles');
  }

  // Retourne la valeur d'un setting (BDD prio, fallback env var de la def).
  async get(key: string): Promise<string | null> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (row?.value !== null && row?.value !== undefined && row.value !== '') return row.value;
    const def = findSettingDef(key);
    if (def?.envVar && process.env[def.envVar]) return process.env[def.envVar] as string;
    return def?.defaultValue ?? null;
  }

  async getBool(key: string): Promise<boolean> {
    const v = await this.get(key);
    return v === 'true' || v === '1';
  }

  async getInt(key: string, fallback = 0): Promise<number> {
    const v = await this.get(key);
    if (!v) return fallback;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? fallback : n;
  }

  // Liste des settings groupes par categorie, secrets masques (juste un flag "isSet").
  async listForAdmin() {
    const all = await this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
    const enriched = all.map((s) => {
      const def = findSettingDef(s.key);
      return {
        key: s.key,
        category: s.category,
        label: s.label ?? def?.label ?? s.key,
        description: s.description ?? def?.description,
        isSecret: s.isSecret,
        // Pour les secrets : ne jamais exposer la valeur, juste indiquer si set
        value: s.isSecret ? null : s.value,
        isSet: s.isSecret ? Boolean(s.value && s.value.length > 0) : Boolean(s.value),
        envFallback: def?.envVar ? Boolean(process.env[def.envVar]) : false,
        updatedAt: s.updatedAt,
      };
    });

    const categories: Record<string, typeof enriched> = {};
    for (const s of enriched) {
      if (!categories[s.category]) categories[s.category] = [] as any;
      (categories[s.category] as any).push(s);
    }
    return categories;
  }

  async update(key: string, value: string | null, userId: string) {
    const def = findSettingDef(key);
    if (!def) throw new NotFoundException('Setting inconnu : ' + key);
    // Pour les secrets, si la valeur est le masque, on ne touche pas
    if (def.isSecret && value === SECRET_MASK) return { key, unchanged: true };
    const stored = value && value.trim() !== '' ? value : null;
    await this.prisma.setting.update({
      where: { key },
      data: { value: stored, updatedById: userId },
    });
    return { key, isSet: Boolean(stored) };
  }
}
