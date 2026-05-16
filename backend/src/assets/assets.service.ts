import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, AssetType, AssetStatus } from '@prisma/client';
import { addDays } from 'date-fns';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
  ) {}

  findAll(
    me: JwtUser,
    params: {
      companyId?: string;
      type?: AssetType;
      status?: AssetStatus;
      expiringInDays?: number;
      identifier?: string;
    },
  ) {
    const where: Prisma.AssetWhereInput = this.scope.scopedWhere(me);
    if (params.companyId) where.companyId = params.companyId;
    if (params.type) where.type = params.type;
    if (params.status) where.status = params.status;
    if (params.expiringInDays != null) {
      where.expiresAt = { gte: new Date(), lte: addDays(new Date(), params.expiringInDays) };
    }
    // Recherche par numero de serie / identifiant : utile pour le scan de
    // code-barres en intervention. On match exact (case-insensitive) plutot
    // que contains pour eviter les collisions sur des suffixes courts.
    if (params.identifier) where.identifier = { equals: params.identifier, mode: 'insensitive' };
    return this.prisma.asset.findMany({
      where,
      include: { company: { select: { id: true, name: true } }, contract: { select: { id: true, reference: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string, me: JwtUser) {
    const a = await this.prisma.asset.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: { company: true, contract: true },
    });
    if (!a) throw new NotFoundException('Asset introuvable');
    return a;
  }

  async create(dto: CreateAssetDto, me: JwtUser) {
    await this.scope.assertCompanyInTenant(dto.companyId, me);
    return this.prisma.asset.create({
      data: {
        ...dto,
        tenantId: me.tenantId,
        acquiredAt: dto.acquiredAt ? new Date(dto.acquiredAt) : null,
        warrantyUntil: dto.warrantyUntil ? new Date(dto.warrantyUntil) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async update(id: string, dto: UpdateAssetDto, me: JwtUser) {
    await this.findOne(id, me);
    const data: Prisma.AssetUpdateInput = { ...dto } as any;
    if (dto.acquiredAt) data.acquiredAt = new Date(dto.acquiredAt);
    if (dto.warrantyUntil) data.warrantyUntil = new Date(dto.warrantyUntil);
    if (dto.expiresAt) data.expiresAt = new Date(dto.expiresAt);
    return this.prisma.asset.update({ where: { id }, data });
  }

  async remove(id: string, me: JwtUser) {
    await this.findOne(id, me);
    await this.prisma.asset.delete({ where: { id } });
    return { success: true };
  }
}
