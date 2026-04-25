import { Global, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType, Prisma } from '@prisma/client';
import { addDays, startOfDay, endOfDay } from 'date-fns';
import { PrismaService } from '../database/prisma.service';

interface CreateNotifInput {
  userId: string;
  type?: NotificationType;
  title: string;
  body?: string;
  entity?: string;
  entityId?: string;
  url?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async push(input: CreateNotifInput) {
    return this.prisma.notification.create({ data: input });
  }

  async pushMany(inputs: CreateNotifInput[]) {
    if (inputs.length === 0) return { count: 0 };
    return this.prisma.notification.createMany({ data: inputs });
  }

  async listForUser(userId: string, params: { unreadOnly?: boolean; limit?: number } = {}) {
    const where: Prisma.NotificationWhereInput = { userId };
    if (params.unreadOnly) where.readAt = null;
    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.limit ?? 50,
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(id: string, userId: string) {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n || n.userId !== userId) return null;
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  // Cron quotidien : notifier les contrats qui expirent dans 30j et les
  // tickets en retard SLA pour leur assignee.
  @Cron('0 9 * * *')
  async dailyDigests() {
    const now = new Date();
    // Contrats qui expirent dans 30j
    const expiring = await this.prisma.contract.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { gte: now, lte: addDays(now, 30) },
        ownerId: { not: null },
      },
      select: { id: true, reference: true, endDate: true, ownerId: true, company: { select: { name: true } } },
    });
    for (const c of expiring) {
      if (!c.ownerId) continue;
      // Eviter doublon : ne pas pousser si une notif identique existe deja non-lue
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId: c.ownerId,
          type: 'CONTRACT_EXPIRING',
          entityId: c.id,
          readAt: null,
        },
      });
      if (existing) continue;
      await this.push({
        userId: c.ownerId,
        type: 'CONTRACT_EXPIRING',
        title: 'Contrat ' + c.reference + ' expire bientot',
        body: c.company.name + ' - fin le ' + c.endDate.toISOString().split('T')[0],
        entity: 'Contract',
        entityId: c.id,
        url: '/contracts/' + c.id,
      });
    }

    // Tickets en retard SLA
    const overdueTickets = await this.prisma.ticket.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER'] },
        dueDate: { lt: now },
        assigneeId: { not: null },
      },
      select: { id: true, reference: true, title: true, assigneeId: true, dueDate: true },
    });
    for (const t of overdueTickets) {
      if (!t.assigneeId) continue;
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId: t.assigneeId,
          type: 'TICKET_OVERDUE',
          entityId: t.id,
          createdAt: { gte: startOfDay(now), lte: endOfDay(now) },
        },
      });
      if (existing) continue;
      await this.push({
        userId: t.assigneeId,
        type: 'TICKET_OVERDUE',
        title: 'Ticket ' + t.reference + ' en retard SLA',
        body: t.title,
        entity: 'Ticket',
        entityId: t.id,
        url: '/tickets/' + t.id,
      });
    }
  }
}
