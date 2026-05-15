import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, InterventionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateInterventionDto } from './dto/create-intervention.dto';
import { UpdateInterventionDto } from './dto/update-intervention.dto';

// MULTI-TENANT : toutes les requetes scopees par tenantId. Cf docs/multi-tenant-pattern.md.

@Injectable()
export class InterventionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(
    params: {
      status?: InterventionStatus;
      companyId?: string;
      contractId?: string;
      technicianId?: string;
    },
    tenantId: string | null,
  ) {
    const where: Prisma.InterventionWhereInput = { tenantId };
    if (params.status) where.status = params.status;
    if (params.companyId) where.companyId = params.companyId;
    if (params.contractId) where.contractId = params.contractId;
    if (params.technicianId) where.technicianId = params.technicianId;
    return this.prisma.intervention.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        contract: { select: { id: true, reference: true } },
        technician: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { scheduledAt: 'desc' },
      take: 500,
    });
  }

  async findOne(id: string, tenantId: string | null) {
    const intervention = await this.prisma.intervention.findFirst({
      where: { id, tenantId },
      include: {
        company: true,
        contract: true,
        technician: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!intervention) throw new NotFoundException('Intervention introuvable');
    return intervention;
  }

  create(dto: CreateInterventionDto, tenantId: string | null) {
    return this.prisma.intervention.create({
      data: {
        ...dto,
        scheduledAt: new Date(dto.scheduledAt),
        tenantId: tenantId ?? undefined,
      },
    });
  }

  async update(id: string, dto: UpdateInterventionDto, tenantId: string | null) {
    await this.findOne(id, tenantId);
    const data: Prisma.InterventionUpdateInput = { ...dto } as any;
    if (dto.scheduledAt) data.scheduledAt = new Date(dto.scheduledAt);
    if (dto.startedAt) data.startedAt = new Date(dto.startedAt);
    if (dto.endedAt) data.endedAt = new Date(dto.endedAt);
    return this.prisma.intervention.update({ where: { id }, data });
  }

  async remove(id: string, tenantId: string | null) {
    await this.findOne(id, tenantId);
    await this.prisma.intervention.delete({ where: { id } });
    return { success: true };
  }
}
