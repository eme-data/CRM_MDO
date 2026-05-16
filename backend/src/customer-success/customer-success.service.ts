import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CustomerSuccessReviewStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CustomerSuccessService {
  private readonly logger = new Logger(CustomerSuccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ============================================================
  // Listing
  // ============================================================
  list(me: JwtUser, params: { companyId?: string; status?: CustomerSuccessReviewStatus; ownerId?: string } = {}) {
    return this.prisma.customerSuccessReview.findMany({
      where: this.scope.scopedWhere(me, {
        ...(params.companyId ? { companyId: params.companyId } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.ownerId ? { ownerId: params.ownerId } : {}),
      }),
      include: {
        company: { select: { id: true, name: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ status: 'asc' }, { scheduledAt: 'asc' }],
    });
  }

  async findOne(id: string, me: JwtUser) {
    const r = await this.prisma.customerSuccessReview.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: {
        company: true,
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!r) throw new NotFoundException('Review introuvable');
    return r;
  }

  async createManual(input: { companyId: string; scheduledAt: string; ownerId?: string }, me: JwtUser) {
    await this.scope.assertCompanyInTenant(input.companyId, me);
    return this.prisma.customerSuccessReview.create({
      data: {
        tenantId: me.tenantId,
        companyId: input.companyId,
        scheduledAt: new Date(input.scheduledAt),
        ownerId: input.ownerId,
        agendaItems: await this.generateAgenda(input.companyId) as any,
      },
    });
  }

  async update(id: string, input: {
    scheduledAt?: string;
    status?: CustomerSuccessReviewStatus;
    notes?: string | null;
    satisfactionScore?: number | null;
    ownerId?: string | null;
  }, me: JwtUser) {
    await this.findOne(id, me);
    const data: Prisma.CustomerSuccessReviewUpdateInput = {};
    if (input.scheduledAt !== undefined) data.scheduledAt = new Date(input.scheduledAt);
    if (input.status !== undefined) {
      data.status = input.status;
      if (input.status === 'COMPLETED') data.heldAt = new Date();
    }
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.satisfactionScore !== undefined) data.satisfactionScore = input.satisfactionScore;
    if (input.ownerId !== undefined) {
      data.owner = input.ownerId ? { connect: { id: input.ownerId } } : { disconnect: true };
    }
    return this.prisma.customerSuccessReview.update({ where: { id }, data });
  }

  async remove(id: string, me: JwtUser) {
    await this.findOne(id, me);
    await this.prisma.customerSuccessReview.delete({ where: { id } });
    return { ok: true };
  }

  // ============================================================
  // Generation auto de l'agenda
  // ============================================================
  // Compose des points d'agenda a partir des donnees client : contrats qui
  // expirent, opportunites en cours, alertes Health Score, factures en
  // retard, anciennete du compte, etc.
  // Note tenant : tous les filtres sont scopes par companyId qui appartient
  // au tenant verifie en amont — donc les donnees sont implicitement isolees.
  async generateAgenda(companyId: string) {
    const now = new Date();
    const in90 = new Date(now.getTime() + 90 * 86400_000);

    const [expiringContracts, openOpps, unpaidInvoices, recentTickets, lastIntervention] = await Promise.all([
      this.prisma.contract.findMany({
        where: { companyId, status: 'ACTIVE', endDate: { gte: now, lte: in90 } },
        select: { reference: true, endDate: true, monthlyAmountHt: true },
      }),
      this.prisma.opportunity.findMany({
        where: { companyId, stage: { in: ['QUALIFICATION', 'PROPOSITION', 'NEGOCIATION'] } },
        select: { title: true, amountHt: true, stage: true },
      }),
      this.prisma.invoice.count({
        where: { companyId, paidAt: null, status: { in: ['ISSUED', 'OVERDUE'] } },
      }),
      this.prisma.ticket.count({
        where: { companyId, createdAt: { gte: new Date(now.getTime() - 90 * 86400_000) } },
      }),
      this.prisma.intervention.findFirst({
        where: { companyId },
        orderBy: { scheduledAt: 'desc' },
        select: { scheduledAt: true },
      }),
    ]);

    return {
      expiringContracts: expiringContracts.map((c) => ({
        reference: c.reference,
        endDate: c.endDate,
        monthlyAmount: Number(c.monthlyAmountHt),
      })),
      openOpportunities: openOpps.map((o) => ({
        title: o.title,
        amount: Number(o.amountHt),
        stage: o.stage,
      })),
      unpaidInvoicesCount: unpaidInvoices,
      ticketsLast90d: recentTickets,
      lastInterventionAt: lastIntervention?.scheduledAt ?? null,
      generatedAt: now.toISOString(),
    };
  }

  async refreshAgenda(id: string, me: JwtUser) {
    const r = await this.findOne(id, me);
    return this.prisma.customerSuccessReview.update({
      where: { id },
      data: { agendaItems: (await this.generateAgenda(r.companyId)) as any },
    });
  }

  // ============================================================
  // Cron mensuel : programme les reviews dues PAR TENANT
  // 1er du mois a 09:00 Europe/Paris (apres rapport mensuel a 08h00)
  // Itere chaque tenant pour utiliser SES propres reglages enabled +
  // frequencyDays + scheduleAheadDays.
  // ============================================================
  @Cron('0 9 1 * *', { name: 'customer-success-schedule', timeZone: 'Europe/Paris' })
  async runScheduleCron() {
    const tenants = await this.prisma.tenant.findMany({ where: { isActive: true }, select: { id: true } });
    let totalScheduled = 0;
    for (const t of tenants) {
      try {
        const enabled = await this.settings.getBool('customerSuccess.enabled', t.id);
        if (!enabled) continue;
        const freqDays = await this.settings.getInt('customerSuccess.frequencyDays', 90, t.id);
        const aheadDays = await this.settings.getInt('customerSuccess.scheduleAheadDays', 7, t.id);

        const customers = await this.prisma.company.findMany({
          where: { tenantId: t.id, status: 'CUSTOMER' },
          select: {
            id: true, name: true, ownerId: true,
            customerSuccessReviews: {
              orderBy: { scheduledAt: 'desc' },
              take: 1,
              select: { scheduledAt: true, status: true, heldAt: true },
            },
          },
        });

        for (const c of customers) {
          const last = c.customerSuccessReviews[0];
          // Skip si une review est deja SCHEDULED dans le futur
          if (last && last.status === 'SCHEDULED' && last.scheduledAt > new Date()) continue;
          // Reference pour le calcul d'eligibilite : derniere date utile (heldAt si
          // completee, sinon scheduledAt). Si jamais de review : c'est le 1er.
          const lastDate = last?.heldAt ?? last?.scheduledAt;
          if (lastDate && (Date.now() - lastDate.getTime()) < freqDays * 86400_000) continue;

          const scheduledAt = new Date(Date.now() + aheadDays * 86400_000);
          await this.prisma.customerSuccessReview.create({
            data: {
              tenantId: t.id,
              companyId: c.id,
              scheduledAt,
              ownerId: c.ownerId,
              agendaItems: (await this.generateAgenda(c.id)) as any,
            },
          });
          totalScheduled++;

          // Notifie l'owner (si defini)
          if (c.ownerId) {
            await this.notifications.push({
              userId: c.ownerId,
              type: 'GENERIC',
              title: 'QBR programme : ' + c.name,
              body: 'Revue trimestrielle prevue le ' + scheduledAt.toISOString().slice(0, 10) + '. Agenda pre-genere.',
              entity: 'Company',
              entityId: c.id,
              url: '/companies/' + c.id,
            });
          }
        }
      } catch (err: any) {
        this.logger.warn('QBR cron tenant ' + t.id + ' echec : ' + err.message);
      }
    }
    this.logger.log('Cron QBR : ' + totalScheduled + ' review(s) programme(s) sur ' + tenants.length + ' tenant(s)');
  }

  // Cron quotidien : envoie un rappel J-7 a l'owner pour les reviews
  // SCHEDULED qui approchent (et n'ont pas encore eu de reminder).
  // Cron systeme global : itere toutes les reviews tous tenants — chaque
  // notification est rattachee au user owner (qui est lui-meme dans son tenant).
  @Cron('0 8 * * *', { name: 'customer-success-reminder', timeZone: 'Europe/Paris' })
  async runReminderCron() {
    const j7 = new Date(Date.now() + 7 * 86400_000);
    const reviews = await this.prisma.customerSuccessReview.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: j7, gte: new Date() },
        reminderSentAt: null,
        ownerId: { not: null },
      },
      include: { company: { select: { name: true } } },
    });
    for (const r of reviews) {
      if (!r.ownerId) continue;
      await this.notifications.push({
        userId: r.ownerId,
        type: 'GENERIC',
        title: 'QBR ' + r.company.name + ' dans 7 jours',
        body: 'Pensez a prendre le RDV avec le client si ce n\'est pas deja fait.',
        entity: 'CustomerSuccessReview',
        entityId: r.id,
        url: '/customer-success/' + r.id,
      });
      await this.prisma.customerSuccessReview.update({
        where: { id: r.id },
        data: { reminderSentAt: new Date() },
      });
    }
    if (reviews.length > 0) this.logger.log('QBR reminders : ' + reviews.length + ' envoye(s)');
  }
}
