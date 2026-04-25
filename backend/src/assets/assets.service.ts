import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, AssetType, AssetStatus } from '@prisma/client';
import { addDays } from 'date-fns';
import { PrismaService } from '../database/prisma.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(params: { companyId?: string; type?: AssetType; status?: AssetStatus; expiringInDays?: number }) {
    const where: Prisma.AssetWhereInput = {};
    if (params.companyId) where.companyId = params.companyId;
    if (params.type) where.type = params.type;
    if (params.status) where.status = params.status;
    if (params.expiringInDays != null) {
      where.expiresAt = { gte: new Date(), lte: addDays(new Date(), params.expiringInDays) };
    }
    return this.prisma.asset.findMany({
      where,
      include: { company: { select: { id: true, name: true } }, contract: { select: { id: true, reference: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const a = await this.prisma.asset.findUnique({
      where: { id },
      include: { company: true, contract: true },
    });
    if (!a) throw new NotFoundException('Asset introuvable');
    return a;
  }

  create(dto: CreateAssetDto) {
    return this.prisma.asset.create({
      data: {
        ...dto,
        acquiredAt: dto.acquiredAt ? new Date(dto.acquiredAt) : null,
        warrantyUntil: dto.warrantyUntil ? new Date(dto.warrantyUntil) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  async update(id: string, dto: UpdateAssetDto) {
    await this.findOne(id);
    const data: Prisma.AssetUpdateInput = { ...dto } as any;
    if (dto.acquiredAt) data.acquiredAt = new Date(dto.acquiredAt);
    if (dto.warrantyUntil) data.warrantyUntil = new Date(dto.warrantyUntil);
    if (dto.expiresAt) data.expiresAt = new Date(dto.expiresAt);
    return this.prisma.asset.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.asset.delete({ where: { id } });
    return { success: true };
  }
}
