import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StockService } from './stock.service';

// Cron quotidien : alerte les gestionnaires (ADMIN/MANAGER) de chaque tenant sur
// les articles passes sous leur seuil de reappro et les commandes fournisseurs
// en retard. Exploite des donnees deja stockees (reorderPoint, expectedDate) qui
// n'etaient jusque-la visibles que sur le dashboard.
@Injectable()
export class StockAlertsProcessor {
  private readonly logger = new Logger(StockAlertsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly stock: StockService,
  ) {}

  @Cron('0 7 * * *', { name: 'stock-alerts-daily', timeZone: 'Europe/Paris' })
  async dailyStockAlerts() {
    // Try/catch racine : une exception non catchee crasherait le scheduler
    // @nestjs/schedule et stopperait tous les autres crons du process.
    try {
      // On ne cible que les tenants ayant des articles actifs (groupBy).
      const groups = await this.prisma.stockItem.groupBy({
        by: ['tenantId'],
        where: { active: true, tenantId: { not: null } },
      });
      const tenantIds = groups.map((g) => g.tenantId).filter((t): t is string => !!t);
      this.logger.log('Scan reappro stock pour ' + tenantIds.length + ' tenant(s)');

      for (const tenantId of tenantIds) {
        try {
          await this.alertTenant(tenantId);
        } catch (err: any) {
          this.logger.error('Alerte stock tenant ' + tenantId + ' echouee : ' + (err?.message ?? err));
        }
      }
    } catch (err: any) {
      this.logger.error('Cron stock-alerts a echoue : ' + (err?.message ?? err));
    }
  }

  private async alertTenant(tenantId: string) {
    const [low, overdue] = await Promise.all([
      this.stock.lowStockForTenant(tenantId),
      this.stock.overduePos({ tenantId }),
    ]);
    if (low.length === 0 && overdue.length === 0) return;

    const managers = await this.prisma.user.findMany({
      where: { tenantId, role: { in: ['ADMIN', 'MANAGER'] }, isActive: true },
      select: { id: true },
    });
    if (managers.length === 0) return;

    const parts: string[] = [];
    if (low.length > 0) parts.push(low.length + ' article(s) sous le seuil de reappro');
    if (overdue.length > 0) parts.push(overdue.length + ' commande(s) fournisseur en retard');
    const body = parts.join(' · ');

    await this.notifications.pushMany(
      managers.map((m) => ({
        userId: m.id,
        type: 'GENERIC' as const,
        title: 'Stock : action requise',
        body,
        entity: 'Stock',
        url: '/stock',
      })),
    );
    this.logger.log(
      'Tenant ' + tenantId + ' : ' + body + ' -> ' + managers.length + ' gestionnaire(s) notifie(s)',
    );
  }
}
