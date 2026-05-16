import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

// MULTI-TENANT : toutes les requetes scopees par tenantId.

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(
    params: {
      status?: TaskStatus;
      assigneeId?: string;
      companyId?: string;
      contractId?: string;
    },
    tenantId: string | null,
  ) {
    const where: Prisma.TaskWhereInput = { tenantId };
    if (params.status) where.status = params.status;
    if (params.assigneeId) where.assigneeId = params.assigneeId;
    if (params.companyId) where.companyId = params.companyId;
    if (params.contractId) where.contractId = params.contractId;
    return this.prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        company: { select: { id: true, name: true } },
        contract: { select: { id: true, reference: true } },
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      take: 500,
    });
  }

  async findOne(id: string, tenantId: string | null) {
    const task = await this.prisma.task.findFirst({
      where: { id, tenantId },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        company: true,
        contact: true,
        opportunity: true,
        contract: true,
      },
    });
    if (!task) throw new NotFoundException('Tache introuvable');
    return task;
  }

  create(dto: CreateTaskDto, userId: string, tenantId: string | null) {
    return this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        status: dto.status,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        assigneeId: dto.assigneeId ?? userId,
        createdById: userId,
        companyId: dto.companyId,
        contactId: dto.contactId,
        opportunityId: dto.opportunityId,
        contractId: dto.contractId,
        tenantId: tenantId ?? undefined,
      },
    });
  }

  async update(id: string, dto: UpdateTaskDto, tenantId: string | null) {
    await this.findOne(id, tenantId);
    const data: Prisma.TaskUpdateInput = { ...dto } as any;
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    if (dto.status === 'DONE') data.completedAt = new Date();
    return this.prisma.task.update({ where: { id }, data });
  }

  async remove(id: string, tenantId: string | null) {
    await this.findOne(id, tenantId);
    await this.prisma.task.delete({ where: { id } });
    return { success: true };
  }
}
