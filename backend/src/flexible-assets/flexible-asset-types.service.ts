import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FlexibleFieldType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

export interface UpsertFieldDto {
  id?: string;
  key: string;
  label: string;
  fieldType: FlexibleFieldType;
  required?: boolean;
  position?: number;
  options?: string;
  refEntity?: string;
  helpText?: string;
}

export interface UpsertTypeDto {
  name: string;
  icon?: string;
  color?: string;
  description?: string;
  fields: UpsertFieldDto[];
}

// Multi-tenant FULL (cf migration 0003) : chaque tenant a ses propres types
// d'assets flexibles. Le name passe d'unique global a unique par tenant.

@Injectable()
export class FlexibleAssetTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
  ) {}

  list(me: JwtUser) {
    return this.prisma.flexibleAssetType.findMany({
      where: this.scope.scopedWhere(me),
      orderBy: { name: 'asc' },
      include: {
        fields: { orderBy: { position: 'asc' } },
        _count: { select: { assets: true } },
      },
    });
  }

  async findOne(id: string, me: JwtUser) {
    const t = await this.prisma.flexibleAssetType.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: { fields: { orderBy: { position: 'asc' } } },
    });
    if (!t) throw new NotFoundException('Type introuvable');
    return t;
  }

  private validateFields(fields: UpsertFieldDto[]) {
    if (!Array.isArray(fields) || fields.length === 0) {
      throw new BadRequestException('Au moins un champ est requis');
    }
    const keys = new Set<string>();
    for (const f of fields) {
      if (!/^[a-z][a-z0-9_]*$/.test(f.key)) {
        throw new BadRequestException(
          'Cle invalide "' + f.key + '" : minuscules / chiffres / underscore, commence par une lettre',
        );
      }
      if (keys.has(f.key)) {
        throw new BadRequestException('Cle dupliquee : ' + f.key);
      }
      keys.add(f.key);
    }
  }

  async create(dto: UpsertTypeDto, me: JwtUser) {
    this.validateFields(dto.fields);
    return this.prisma.flexibleAssetType.create({
      data: {
        tenantId: me.tenantId,
        name: dto.name,
        icon: dto.icon,
        color: dto.color,
        description: dto.description,
        fields: {
          create: dto.fields.map((f, idx) => ({
            key: f.key,
            label: f.label,
            fieldType: f.fieldType,
            required: f.required ?? false,
            position: f.position ?? idx,
            options: f.options,
            refEntity: f.refEntity,
            helpText: f.helpText,
          })),
        },
      },
      include: { fields: { orderBy: { position: 'asc' } } },
    });
  }

  async update(id: string, dto: UpsertTypeDto, me: JwtUser) {
    await this.findOne(id, me); // assert tenant ownership
    this.validateFields(dto.fields);

    // Strategie : on diff les champs (cle = position dans le schema).
    // Pour simplifier : on supprime les champs absents, on update les existants,
    // on cree les nouveaux. Attention : on ne touche pas aux valeurs des assets,
    // mais une cle disparue rendra ses valeurs orphelines (juste ignorees a l'affichage).
    return this.prisma.$transaction(async (tx) => {
      await tx.flexibleAssetType.update({
        where: { id },
        data: {
          name: dto.name,
          icon: dto.icon,
          color: dto.color,
          description: dto.description,
        },
      });

      const existing = await tx.flexibleAssetField.findMany({ where: { typeId: id } });
      const incomingKeys = new Set(dto.fields.map((f) => f.key));

      // Supprimer les champs disparus
      for (const e of existing) {
        if (!incomingKeys.has(e.key)) {
          await tx.flexibleAssetField.delete({ where: { id: e.id } });
        }
      }
      // Upsert
      for (let i = 0; i < dto.fields.length; i++) {
        const f = dto.fields[i];
        const existingField = existing.find((e) => e.key === f.key);
        if (existingField) {
          await tx.flexibleAssetField.update({
            where: { id: existingField.id },
            data: {
              label: f.label,
              fieldType: f.fieldType,
              required: f.required ?? false,
              position: f.position ?? i,
              options: f.options,
              refEntity: f.refEntity,
              helpText: f.helpText,
            },
          });
        } else {
          await tx.flexibleAssetField.create({
            data: {
              typeId: id,
              key: f.key,
              label: f.label,
              fieldType: f.fieldType,
              required: f.required ?? false,
              position: f.position ?? i,
              options: f.options,
              refEntity: f.refEntity,
              helpText: f.helpText,
            },
          });
        }
      }
      return tx.flexibleAssetType.findUnique({
        where: { id },
        include: { fields: { orderBy: { position: 'asc' } } },
      });
    });
  }

  async remove(id: string, me: JwtUser) {
    await this.findOne(id, me); // assert tenant ownership
    const usage = await this.prisma.flexibleAsset.count({ where: { typeId: id } });
    if (usage > 0) {
      throw new BadRequestException(
        'Type utilise par ' + usage + ' instance(s). Supprimez-les avant de supprimer le type.',
      );
    }
    await this.prisma.flexibleAssetType.delete({ where: { id } });
    return { success: true };
  }
}
