import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SecretsService } from '../client-docs/secrets.service';

export interface UpsertFlexibleAssetDto {
  typeId: string;
  companyId: string;
  locationId?: string | null;
  name: string;
  // Toutes les valeurs en clair { key: value }. Les champs PASSWORD seront
  // detectes via le type et chiffres dans secretValues.
  values: Record<string, unknown>;
}

@Injectable()
export class FlexibleAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
  ) {}

  listForCompany(companyId: string) {
    return this.prisma.flexibleAsset.findMany({
      where: { companyId },
      orderBy: [{ type: { name: 'asc' } }, { name: 'asc' }],
      include: {
        type: { include: { fields: { orderBy: { position: 'asc' } } } },
        location: { select: { id: true, name: true } },
      },
    });
  }

  async findOne(id: string, opts: { reveal?: boolean; userId?: string } = {}) {
    const a = await this.prisma.flexibleAsset.findUnique({
      where: { id },
      include: {
        type: { include: { fields: { orderBy: { position: 'asc' } } } },
        location: true,
        company: { select: { id: true, name: true } },
      },
    });
    if (!a) throw new NotFoundException('Asset flexible introuvable');

    const out: any = { ...a };
    if (opts.reveal) {
      const sv = (a.secretValues as Record<string, string>) ?? {};
      const dec: Record<string, string> = {};
      for (const [k, v] of Object.entries(sv)) {
        try {
          dec[k] = this.secrets.decrypt(v);
        } catch {
          dec[k] = '';
        }
      }
      out.secretValuesRevealed = dec;
      if (opts.userId) {
        await this.prisma.activity.create({
          data: {
            userId: opts.userId,
            action: 'REVEAL_FLEXIBLE_ASSET_SECRETS',
            entity: 'FlexibleAsset',
            entityId: id,
          },
        });
      }
    } else {
      // Ne JAMAIS retourner les valeurs chiffrees brutes
      out.secretValues = undefined;
      out.hasSecrets =
        Object.keys((a.secretValues as Record<string, string>) ?? {}).length > 0;
    }
    return out;
  }

  // Splitte values en clair / cipher selon le type de chaque champ defini par le type
  private async splitValues(
    typeId: string,
    values: Record<string, unknown>,
  ): Promise<{ clear: Record<string, unknown>; ciphered: Record<string, string> }> {
    const fields = await this.prisma.flexibleAssetField.findMany({ where: { typeId } });
    const fieldByKey = new Map(fields.map((f) => [f.key, f]));
    const clear: Record<string, unknown> = {};
    const ciphered: Record<string, string> = {};
    for (const [key, raw] of Object.entries(values ?? {})) {
      const f = fieldByKey.get(key);
      if (!f) continue; // cle inconnue ignoree
      if (raw === null || raw === undefined || raw === '') continue;
      if (f.fieldType === 'PASSWORD') {
        ciphered[key] = this.secrets.encrypt(String(raw));
      } else {
        clear[key] = raw;
      }
    }
    // Verifier les required
    for (const f of fields) {
      if (!f.required) continue;
      const has = clear[f.key] !== undefined || ciphered[f.key] !== undefined;
      if (!has) throw new BadRequestException('Champ requis manquant : ' + f.label);
    }
    return { clear, ciphered };
  }

  async create(dto: UpsertFlexibleAssetDto) {
    const { clear, ciphered } = await this.splitValues(dto.typeId, dto.values ?? {});
    return this.prisma.flexibleAsset.create({
      data: {
        typeId: dto.typeId,
        companyId: dto.companyId,
        locationId: dto.locationId ?? null,
        name: dto.name,
        values: clear,
        secretValues: ciphered,
      },
      include: {
        type: { include: { fields: { orderBy: { position: 'asc' } } } },
      },
    });
  }

  async update(id: string, dto: Partial<UpsertFlexibleAssetDto>) {
    const existing = await this.prisma.flexibleAsset.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Asset flexible introuvable');

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.locationId !== undefined) data.locationId = dto.locationId ?? null;

    if (dto.values !== undefined) {
      const { clear, ciphered } = await this.splitValues(existing.typeId, dto.values);
      // Merger avec l'existant pour permettre updates partiels
      const existingClear = (existing.values as Record<string, unknown>) ?? {};
      const existingCipher = (existing.secretValues as Record<string, string>) ?? {};
      data.values = { ...existingClear, ...clear };
      data.secretValues = { ...existingCipher, ...ciphered };
    }

    return this.prisma.flexibleAsset.update({
      where: { id },
      data,
      include: {
        type: { include: { fields: { orderBy: { position: 'asc' } } } },
      },
    });
  }

  async remove(id: string) {
    await this.prisma.flexibleAsset.delete({ where: { id } });
    return { success: true };
  }
}
