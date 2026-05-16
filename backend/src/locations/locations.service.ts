import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
  ) {}

  async listForCompany(companyId: string, me: JwtUser) {
    await this.scope.assertCompanyInTenant(companyId, me);
    return this.prisma.location.findMany({
      where: { companyId },
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { networks: true, flexibleAssets: true } },
      },
    });
  }

  async findOne(id: string, me: JwtUser) {
    const l = await this.prisma.location.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: { networks: true, flexibleAssets: { include: { type: true } } },
    });
    if (!l) throw new NotFoundException('Site introuvable');
    return l;
  }

  async create(dto: UpsertLocationDto, me: JwtUser) {
    await this.scope.assertCompanyInTenant(dto.companyId, me);
    if (dto.isPrimary) {
      // Un seul site principal par societe
      await this.prisma.location.updateMany({
        where: { companyId: dto.companyId, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return this.prisma.location.create({ data: { ...dto, tenantId: me.tenantId } });
  }

  async update(id: string, dto: Partial<UpsertLocationDto>, me: JwtUser) {
    const existing = await this.findOne(id, me);
    if (dto.isPrimary) {
      await this.prisma.location.updateMany({
        where: { companyId: existing.companyId, isPrimary: true, id: { not: id } },
        data: { isPrimary: false },
      });
    }
    return this.prisma.location.update({ where: { id }, data: dto });
  }

  async remove(id: string, me: JwtUser) {
    await this.findOne(id, me);
    await this.prisma.location.delete({ where: { id } });
    return { success: true };
  }
}
