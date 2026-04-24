import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { startOfDay, endOfDay } from 'date-fns';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../../mail/mail.service';

@Injectable()
export class ContractAlertsProcessor {
  private readonly logger = new Logger(ContractAlertsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // Tous les matins a 8h (heure du serveur / TZ=Europe/Paris)
  @Cron('0 8 * * *')
  async processDailyAlerts() {
    const from = startOfDay(new Date());
    const to = endOfDay(new Date());
    this.logger.log('Scan des alertes de renouvellement du jour...');

    const due = await this.prisma.contractRenewalAlert.findMany({
      where: {
        alertDate: { gte: from, lte: to },
        sentAt: null,
        resolved: false,
      },
      include: {
        contract: {
          include: {
            company: true,
            owner: { select: { email: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    this.logger.log('Alertes a traiter: ' + due.length);

    for (const alert of due) {
      try {
        if (alert.contract.status !== 'ACTIVE') {
          await this.prisma.contractRenewalAlert.update({
            where: { id: alert.id },
            data: { resolved: true, sentAt: new Date() },
          });
          continue;
        }

        const to = alert.contract.owner?.email;
        if (!to) {
          this.logger.warn('Alert ' + alert.id + ': pas de owner email, on skip');
          await this.prisma.contractRenewalAlert.update({
            where: { id: alert.id },
            data: { sentAt: new Date() },
          });
          continue;
        }

        await this.mail.sendContractRenewalAlert({
          to,
          contract: {
            reference: alert.contract.reference,
            title: alert.contract.title,
            endDate: alert.contract.endDate,
            offer: alert.contract.offer,
            monthlyAmountHt: Number(alert.contract.monthlyAmountHt),
          },
          company: { name: alert.contract.company.name },
          daysBefore: alert.daysBefore,
        });

        await this.prisma.contractRenewalAlert.update({
          where: { id: alert.id },
          data: { sentAt: new Date() },
        });
        this.logger.log('Alerte envoyee pour contrat ' + alert.contract.reference);
      } catch (err) {
        this.logger.error('Erreur alerte ' + alert.id, err as Error);
      }
    }
  }

  // Scan horaire : marquer EXPIRED les contrats dont la fin est passee
  @Cron(CronExpression.EVERY_HOUR)
  async markExpired() {
    const result = await this.prisma.contract.updateMany({
      where: {
        status: 'ACTIVE',
        endDate: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
    if (result.count > 0) {
      this.logger.log(result.count + ' contrats passes en EXPIRED');
    }
  }
}
