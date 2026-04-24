import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, InterventionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateInterventionDto } from './dto/create-intervention.dto';
import { UpdateInterventionDto } from './dto/update-intervention.dto';

@Injectable()
export class InterventionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(params: {
    status?: InterventionStatus;
    companyId?: string;
    contractId?: string;
    technicianId?: string;
  }) {
    const where: Prisma.InterventionWhereInput = {};
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
    });
  }

  async findOne(id: string) {
    const intervention = await this.prisma.intervention.findUnique({
      where: { id },
      include: {
        company: true,
        contract: true,
        technician: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!intervention) throw new NotFoundException('Intervention introuvable');
    return intervention;
  }

  create(dto: CreateInterventionDto) {
    return this.prisma.intervention.create({
      data: {
        ...dto,
        scheduledAt: new Date(dto.scheduledAt),
      },
    });
  }

  async update(id: string, dto: UpdateInterventionDto) {
    await this.findOne(id);
    const data: Prisma.InterventionUpdateInput = { ...dto } as any;
    if (dto.scheduledAt) data.scheduledAt = new Date(dto.scheduledAt);
    if (dto.startedAt) data.startedAt = new Date(dto.startedAt);
    if (dto.endedAt) data.endedAt = new Date(dto.endedAt);
    return this.prisma.intervention.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.intervention.delete({ where: { id } });
    return { success: true };
  }
}
