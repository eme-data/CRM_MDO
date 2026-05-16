import { Injectable, NotFoundException } from '@nestjs/common';
import { NetworkKind } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

export interface UpsertNetworkDto {
  companyId: string;
  locationId?: string | null;
  name: string;
  kind?: NetworkKind;
  cidr?: string;
  vlanId?: number;
  gateway?: string;
  dnsServers?: string;
  dhcpStart?: string;
  dhcpEnd?: string;
  description?: string;
}

@Injectable()
export class NetworksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
  ) {}

  async listForCompany(companyId: string, me: JwtUser) {
    await this.scope.assertCompanyInTenant(companyId, me);
    return this.prisma.network.findMany({
      where: { companyId },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      include: { location: { select: { id: true, name: true } } },
    });
  }

  async findOne(id: string, me: JwtUser) {
    const n = await this.prisma.network.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: { location: true, company: { select: { id: true, name: true } } },
    });
    if (!n) throw new NotFoundException('Reseau introuvable');
    return n;
  }

  async create(dto: UpsertNetworkDto, me: JwtUser) {
    await this.scope.assertCompanyInTenant(dto.companyId, me);
    return this.prisma.network.create({ data: { ...dto, tenantId: me.tenantId } });
  }

  async update(id: string, dto: Partial<UpsertNetworkDto>, me: JwtUser) {
    await this.findOne(id, me);
    return this.prisma.network.update({ where: { id }, data: dto });
  }

  async remove(id: string, me: JwtUser) {
    await this.findOne(id, me);
    await this.prisma.network.delete({ where: { id } });
    return { success: true };
  }
}
