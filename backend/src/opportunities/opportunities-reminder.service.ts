import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { subDays } from 'date-fns';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const STAGNANT_DAYS = 7;

@Injectable()
export class OpportunitiesReminderService {
  private readonly logger = new Logger(OpportunitiesReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // Tous les lundis 9h : alerter les owners sur leurs opportunites stagnantes
  @Cron('0 9 * * 1')
  async stagnantOpportunities() {
    const cutoff = subDays(new Date(), STAGNANT_DAYS);
    const opps = await this.prisma.opportunity.findMany({
      where: {
        stage: { notIn: ['GAGNE', 'PERDU'] },
        updatedAt: { lt: cutoff },
        ownerId: { not: null },
      },
      select: {
        id: true,
        title: true,
        stage: true,
        updatedAt: true,
        ownerId: true,
        company: { select: { name: true } },
      },
    });
    this.logger.log(opps.length + ' opportunites stagnantes detectees');

    // Regrouper par owner
    const byOwner: Record<string, typeof opps> = {};
    for (const o of opps) {
      if (!o.ownerId) continue;
      if (!byOwner[o.ownerId]) byOwner[o.ownerId] = [] as any;
      (byOwner[o.ownerId] as any).push(o);
    }

    for (const [ownerId, list] of Object.entries(byOwner)) {
      // Une seule notif consolide
      await this.notifications.push({
        userId: ownerId,
        type: 'GENERIC',
        title: list.length + ' opportunite(s) sans activite depuis ' + STAGNANT_DAYS + ' jours',
        body: list.slice(0, 5).map((o) => o.company.name + ' - ' + o.title).join(', ') +
          (list.length > 5 ? ' et ' + (list.length - 5) + ' autre(s)' : ''),
        url: '/opportunities',
      });
    }
  }
}
