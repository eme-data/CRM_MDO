import { Global, Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType, Prisma } from '@prisma/client';
import { addDays, startOfDay, endOfDay } from 'date-fns';
import { PrismaService } from '../database/prisma.service';
import { PushService } from '../push/push.service';

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
  constructor(
    private readonly prisma: PrismaService,
    // Optional pour ne pas creer de cycle d'init si PushModule est absent
    // (tests, environnement degrade). Si dispo, on pousse aussi en Web Push.
    @Optional() private readonly pushService?: PushService,
  ) {}

  async push(input: CreateNotifInput) {
    const notif = await this.prisma.notification.create({ data: input });
    // Best-effort web push : ne fait pas echouer la notif in-app si push fail
    if (this.pushService) {
      this.pushService
        .send(input.userId, {
          title: input.title,
          body: input.body,
          url: input.url,
          tag: input.entity && input.entityId ? input.entity + ':' + input.entityId : undefined,
          data: { entity: input.entity, entityId: input.entityId, notifId: notif.id },
        })
        .catch(() => {}); // silencieux : la notif in-app reste creee
    }
    return notif;
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
  @Cron('0 9 * * *', { name: 'notifications-daily-digest', timeZone: 'Europe/Paris' })
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
    // Eviter N+1 : on charge en UNE query toutes les notifs CONTRACT_EXPIRING
    // non-lues pour les contracts concernes, puis on filtre en memoire.
    // Avant : 30 contrats = 31 queries (1 findMany + 30 findFirst).
    // Apres : 30 contrats = 2 queries.
    const expiringIds = expiring.map((c) => c.id);
    const existingExpiring = expiringIds.length > 0
      ? await this.prisma.notification.findMany({
          where: {
            type: 'CONTRACT_EXPIRING',
            entityId: { in: expiringIds },
            readAt: null,
          },
          select: { entityId: true, userId: true },
        })
      : [];
    const alreadyNotifiedContracts = new Set(
      existingExpiring.map((n) => n.entityId + '|' + n.userId),
    );
    for (const c of expiring) {
      if (!c.ownerId) continue;
      if (alreadyNotifiedContracts.has(c.id + '|' + c.ownerId)) continue;
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
    // Meme deduplication groupee pour les tickets, sur la fenetre journee.
    const overdueIds = overdueTickets.map((t) => t.id);
    const existingOverdue = overdueIds.length > 0
      ? await this.prisma.notification.findMany({
          where: {
            type: 'TICKET_OVERDUE',
            entityId: { in: overdueIds },
            createdAt: { gte: startOfDay(now), lte: endOfDay(now) },
          },
          select: { entityId: true, userId: true },
        })
      : [];
    const alreadyNotifiedTickets = new Set(
      existingOverdue.map((n) => n.entityId + '|' + n.userId),
    );
    for (const t of overdueTickets) {
      if (!t.assigneeId) continue;
      if (alreadyNotifiedTickets.has(t.id + '|' + t.assigneeId)) continue;
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
