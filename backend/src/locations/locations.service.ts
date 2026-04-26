import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface UpsertLocationDto {
  companyId: string;
  name: string;
  isPrimary?: boolean;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  phone?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
}

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  listForCompany(companyId: string) {
    return this.prisma.location.findMany({
      where: { companyId },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { networks: true, flexibleAssets: true } },
      },
    });
  }

  async findOne(id: string) {
    const l = await this.prisma.location.findUnique({
      where: { id },
      include: { networks: true, flexibleAssets: { include: { type: true } } },
    });
    if (!l) throw new NotFoundException('Site introuvable');
    return l;
  }

  async create(dto: UpsertLocationDto) {
    if (dto.isPrimary) {
      // Un seul site principal par societe
      await this.prisma.location.updateMany({
        where: { companyId: dto.companyId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return this.prisma.location.create({ data: dto });
  }

  async update(id: string, dto: Partial<UpsertLocationDto>) {
    const existing = await this.findOne(id);
    if (dto.isPrimary) {
      await this.prisma.location.updateMany({
        where: { companyId: existing.companyId, isPrimary: true, id: { not: id } },
        data: { isPrimary: false },
      });
    }
    return this.prisma.location.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.location.delete({ where: { id } });
    return { success: true };
  }
}
