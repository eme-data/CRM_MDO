import { Injectable, NotFoundException } from '@nestjs/common';
import { NetworkKind } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  listForCompany(companyId: string) {
    return this.prisma.network.findMany({
      where: { companyId },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      include: { location: { select: { id: true, name: true } } },
    });
  }

  async findOne(id: string) {
    const n = await this.prisma.network.findUnique({
      where: { id },
      include: { location: true, company: { select: { id: true, name: true } } },
    });
    if (!n) throw new NotFoundException('Reseau introuvable');
    return n;
  }

  create(dto: UpsertNetworkDto) {
    return this.prisma.network.create({ data: dto });
  }

  async update(id: string, dto: Partial<UpsertNetworkDto>) {
    await this.findOne(id);
    return this.prisma.network.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.network.delete({ where: { id } });
    return { success: true };
  }
}
