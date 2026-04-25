import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TicketStatus,
  TicketPriority,
  TicketCategory,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { AddMessageDto } from './dto/add-message.dto';

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateReference(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `TKT-${year}-`;
    const last = await this.prisma.ticket.findFirst({
      where: { reference: { startsWith: prefix } },
      orderBy: { reference: 'desc' },
      select: { reference: true },
    });
    let next = 1;
    if (last) {
      const match = last.reference.match(/(\d+)$/);
      if (match) next = parseInt(match[1], 10) + 1;
    }
    return `${prefix}${String(next).padStart(5, '0')}`;
  }

  findAll(params: {
    search?: string;
    status?: TicketStatus;
    priority?: TicketPriority;
    category?: TicketCategory;
    companyId?: string;
    assigneeId?: string;
  }) {
    const where: Prisma.TicketWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.priority) where.priority = params.priority;
    if (params.category) where.category = params.category;
    if (params.companyId) where.companyId = params.companyId;
    if (params.assigneeId) where.assigneeId = params.assigneeId;
    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' } },
        { reference: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.ticket.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async kanban(filters: { assigneeId?: string; companyId?: string }) {
    const statuses: TicketStatus[] = [
      'OPEN',
      'IN_PROGRESS',
      'WAITING_CUSTOMER',
      'RESOLVED',
      'CLOSED',
    ];
    const where: Prisma.TicketWhereInput = {};
    if (filters.assigneeId) where.assigneeId = filters.assigneeId;
    if (filters.companyId) where.companyId = filters.companyId;

    const cols = await Promise.all(
      statuses.map(async (status) => {
        const items = await this.prisma.ticket.findMany({
          where: { ...where, status },
          include: {
            company: { select: { id: true, name: true } },
            assignee: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        });
        return { status, items, count: items.length };
      }),
    );
    return cols;
  }

  async findOne(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        company: true,
        contact: true,
        contract: { select: { id: true, reference: true, title: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        messages: {
          include: {
            author: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        interventions: {
          select: { id: true, title: true, status: true, scheduledAt: true },
          orderBy: { scheduledAt: 'desc' },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket introuvable');
    return ticket;
  }

  async create(dto: CreateTicketDto, userId: string) {
    const reference = await this.generateReference();
    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          reference,
          title: dto.title,
          description: dto.description,
          status: dto.status ?? 'OPEN',
          priority: dto.priority ?? 'NORMAL',
          category: dto.category ?? 'INCIDENT',
          channel: dto.channel ?? 'INTERNAL',
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          companyId: dto.companyId,
          contactId: dto.contactId,
          contractId: dto.contractId,
          assigneeId: dto.assigneeId,
          createdById: userId,
        },
      });
      await tx.activity.create({
        data: {
          userId,
          action: 'CREATE',
          entity: 'Ticket',
          entityId: created.id,
          metadata: { reference: created.reference, title: created.title },
        },
      });
      return created;
    });
    return ticket;
  }

  async update(id: string, dto: UpdateTicketDto, userId: string) {
    const existing = await this.findOne(id);
    const data: Prisma.TicketUpdateInput = { ...dto } as any;
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    if (dto.firstResponseAt) data.firstResponseAt = new Date(dto.firstResponseAt);
    if (dto.resolvedAt) data.resolvedAt = new Date(dto.resolvedAt);
    if (dto.closedAt) data.closedAt = new Date(dto.closedAt);

    // Auto-stamp les transitions de statut
    if (dto.status) {
      if (dto.status === 'RESOLVED' && !existing.resolvedAt) {
        data.resolvedAt = new Date();
      }
      if (dto.status === 'CLOSED' && !existing.closedAt) {
        data.closedAt = new Date();
        if (!existing.resolvedAt) data.resolvedAt = new Date();
      }
    }

    const updated = await this.prisma.ticket.update({ where: { id }, data });
    await this.prisma.activity.create({
      data: { userId, action: 'UPDATE', entity: 'Ticket', entityId: id },
    });
    return updated;
  }

  async remove(id: string, userId: string) {
    await this.findOne(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.delete({ where: { id } });
      await tx.activity.create({
        data: { userId, action: 'DELETE', entity: 'Ticket', entityId: id },
      });
    });
    return { success: true };
  }

  async addMessage(ticketId: string, dto: AddMessageDto, userId: string) {
    const ticket = await this.findOne(ticketId);
    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        authorId: userId,
        content: dto.content,
        isInternal: dto.isInternal ?? false,
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Premier message non-interne d'un agent : marquer firstResponseAt
    if (!ticket.firstResponseAt && !dto.isInternal) {
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: { firstResponseAt: new Date() },
      });
    }
    // Si statut OPEN, passer en IN_PROGRESS sur premier message
    if (ticket.status === 'OPEN') {
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: { status: 'IN_PROGRESS' },
      });
    }
    await this.prisma.activity.create({
      data: { userId, action: 'COMMENT', entity: 'Ticket', entityId: ticketId },
    });
    return message;
  }

  async stats() {
    const now = new Date();
    const [open, inProgress, waiting, overdue, resolvedThisMonth] = await Promise.all([
      this.prisma.ticket.count({ where: { status: 'OPEN' } }),
      this.prisma.ticket.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.ticket.count({ where: { status: 'WAITING_CUSTOMER' } }),
      this.prisma.ticket.count({
        where: {
          status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER'] },
          dueDate: { lt: now },
        },
      }),
      this.prisma.ticket.count({
        where: {
          status: { in: ['RESOLVED', 'CLOSED'] },
          resolvedAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), 1),
          },
        },
      }),
    ]);
    return { open, inProgress, waiting, overdue, resolvedThisMonth };
  }
}
