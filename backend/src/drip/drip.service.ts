import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DripCampaignTrigger, DripEnrollmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { MailService } from '../mail/mail.service';

@Injectable()
export class DripService {
  private readonly logger = new Logger(DripService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
    private readonly mail: MailService,
  ) {}

  // ============================================================
  // Campagnes (templates) - par tenant
  // ============================================================
  list(me: JwtUser, includeInactive = false) {
    return this.prisma.dripCampaign.findMany({
      where: this.scope.scopedWhere(me, includeInactive ? {} : { isActive: true }),
      include: {
        steps: { orderBy: { position: 'asc' } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, me: JwtUser) {
    const c = await this.prisma.dripCampaign.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: {
        steps: { orderBy: { position: 'asc' } },
      },
    });
    if (!c) throw new NotFoundException('Campagne introuvable');
    return c;
  }

  async create(input: {
    name: string;
    description?: string;
    trigger?: DripCampaignTrigger;
    steps: Array<{ dayOffset: number; subject: string; bodyHtml: string }>;
  }, me: JwtUser) {
    if (input.steps.length === 0) throw new BadRequestException('Au moins une etape requise');
    return this.prisma.dripCampaign.create({
      data: {
        tenantId: me.tenantId,
        name: input.name,
        description: input.description,
        trigger: input.trigger ?? 'MANUAL',
        steps: {
          create: input.steps.map((s, i) => ({
            position: i,
            dayOffset: s.dayOffset,
            subject: s.subject,
            bodyHtml: s.bodyHtml,
          })),
        },
      },
      include: { steps: true },
    });
  }

  async update(id: string, input: {
    name?: string;
    description?: string | null;
    trigger?: DripCampaignTrigger;
    isActive?: boolean;
    steps?: Array<{ dayOffset: number; subject: string; bodyHtml: string }>;
  }, me: JwtUser) {
    await this.findOne(id, me);
    const data: Prisma.DripCampaignUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.trigger !== undefined) data.trigger = input.trigger;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    return this.prisma.$transaction(async (tx) => {
      if (input.steps) {
        await tx.dripCampaignStep.deleteMany({ where: { campaignId: id } });
        await tx.dripCampaignStep.createMany({
          data: input.steps.map((s, i) => ({
            campaignId: id,
            position: i,
            dayOffset: s.dayOffset,
            subject: s.subject,
            bodyHtml: s.bodyHtml,
          })),
        });
      }
      return tx.dripCampaign.update({ where: { id }, data, include: { steps: true } });
    });
  }

  async remove(id: string, me: JwtUser) {
    await this.findOne(id, me);
    await this.prisma.dripCampaign.delete({ where: { id } });
    return { ok: true };
  }

  // ============================================================
  // Enrollments
  // ============================================================
  async enroll(input: {
    campaignId: string;
    recipientEmail: string;
    recipientName?: string;
    contactId?: string;
    companyId?: string;
  }, me: JwtUser) {
    // Verifie que la campagne appartient bien au tenant courant.
    await this.findOne(input.campaignId, me);
    if (input.companyId) await this.scope.assertCompanyInTenant(input.companyId, me);
    return this.prisma.dripEnrollment.upsert({
      where: { campaignId_recipientEmail: { campaignId: input.campaignId, recipientEmail: input.recipientEmail.toLowerCase() } },
      create: {
        campaignId: input.campaignId,
        recipientEmail: input.recipientEmail.toLowerCase(),
        recipientName: input.recipientName,
        contactId: input.contactId,
        companyId: input.companyId,
      },
      update: {
        // Si on tente de re-enroll un email completed, on le relance
        status: 'RUNNING',
        nextStepIndex: 0,
        enrolledAt: new Date(),
        completedAt: null,
      },
    });
  }

  async listEnrollments(me: JwtUser, params: { campaignId?: string; status?: DripEnrollmentStatus } = {}) {
    return this.prisma.dripEnrollment.findMany({
      where: {
        // Scope tenant via la campagne (DripEnrollment n'a pas de tenantId
        // direct ; on filtre via campaign.tenantId).
        campaign: this.scope.scopedWhere(me),
        ...(params.campaignId ? { campaignId: params.campaignId } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      include: {
        campaign: { select: { name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        company: { select: { id: true, name: true } },
        _count: { select: { sentEmails: true } },
      },
      orderBy: { enrolledAt: 'desc' },
      take: 200,
    });
  }

  // Verifie qu'un enrollment appartient au tenant courant via sa campagne.
  private async assertEnrollmentInTenant(enrollmentId: string, me: JwtUser) {
    if (me.isSuperAdmin) {
      const e = await this.prisma.dripEnrollment.findUnique({ where: { id: enrollmentId } });
      if (!e) throw new NotFoundException();
      return e;
    }
    const e = await this.prisma.dripEnrollment.findFirst({
      where: { id: enrollmentId, campaign: { tenantId: me.tenantId } },
    });
    if (!e) throw new NotFoundException();
    return e;
  }

  async unsubscribe(enrollmentId: string, me: JwtUser) {
    await this.assertEnrollmentInTenant(enrollmentId, me);
    return this.prisma.dripEnrollment.update({
      where: { id: enrollmentId },
      data: { status: 'UNSUBSCRIBED' },
    });
  }

  async pauseResume(enrollmentId: string, status: 'PAUSED' | 'RUNNING', me: JwtUser) {
    await this.assertEnrollmentInTenant(enrollmentId, me);
    return this.prisma.dripEnrollment.update({
      where: { id: enrollmentId },
      data: { status },
    });
  }

  // ============================================================
  // Cron quotidien : envoie les emails dont le step matche aujourd'hui
  // 10:00 Europe/Paris (heure de bureau, taux d'ouverture maximal)
  // Cron systeme : itere TOUS les enrollments tous tenants confondus
  // (chaque mail est envoye via le SMTP du tenant de la campagne — cf
  // mail.service qui devra recevoir le tenantId, vague 12).
  // ============================================================
  @Cron('0 10 * * *', { name: 'drip-daily-send', timeZone: 'Europe/Paris' })
  async runDaily() {
    // Try/catch racine obligatoire : une exception Prisma (DB indispo) non
    // catchee crash le scheduler @nestjs/schedule et stoppe TOUS les autres
    // crons du process. Cf audit 2026-05.
    try {
      return await this.runDailyInner();
    } catch (err: any) {
      this.logger.error('Drip daily cron a echoue : ' + (err?.message ?? err));
    }
  }

  private async runDailyInner() {
    const now = new Date();
    const enrollments = await this.prisma.dripEnrollment.findMany({
      where: { status: 'RUNNING' },
      include: {
        campaign: {
          include: { steps: { orderBy: { position: 'asc' } } },
        },
        contact: true,
        company: true,
      },
    });

    let sent = 0;
    let completed = 0;
    for (const e of enrollments) {
      // Detecte le prochain step a envoyer
      const step = e.campaign.steps[e.nextStepIndex];
      if (!step) {
        await this.prisma.dripEnrollment.update({
          where: { id: e.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        completed++;
        continue;
      }
      // Doit-on envoyer aujourd'hui ?
      const dueDate = new Date(e.enrolledAt.getTime() + step.dayOffset * 86400_000);
      // Si la due date est dans le futur, on attend
      if (dueDate > now) continue;

      // Substitution placeholders
      const html = this.substitute(step.bodyHtml, {
        firstName: e.recipientName?.split(' ')[0] ?? e.contact?.firstName ?? '',
        lastName: e.contact?.lastName ?? '',
        companyName: e.company?.name ?? '',
        email: e.recipientEmail,
      });
      const subject = this.substitute(step.subject, {
        firstName: e.recipientName?.split(' ')[0] ?? e.contact?.firstName ?? '',
        companyName: e.company?.name ?? '',
      });

      try {
        const r = await this.mail.send({
          to: e.recipientEmail,
          subject,
          html,
          relatedEntity: 'DripEnrollment',
          relatedEntityId: e.id,
          tenantId: e.campaign.tenantId,
        });
        const sendStatus = r.status === 'SENT' ? 'SENT' : 'FAILED';
        const sendError = r.status === 'SENT' ? null : (r.error ?? 'unknown');
        await this.prisma.dripSentEmail.upsert({
          where: { enrollmentId_stepId: { enrollmentId: e.id, stepId: step.id } },
          create: {
            enrollmentId: e.id, stepId: step.id, sendStatus, sendError,
          },
          update: { sentAt: new Date(), sendStatus, sendError },
        });
        await this.prisma.dripEnrollment.update({
          where: { id: e.id },
          data: { nextStepIndex: e.nextStepIndex + 1 },
        });
        if (sendStatus === 'SENT') sent++;
      } catch (err: any) {
        this.logger.warn('Drip send failed for ' + e.recipientEmail + ' : ' + err.message);
      }
    }
    if (sent + completed > 0) {
      this.logger.log('Drip daily : ' + sent + ' email(s) envoye(s), ' + completed + ' enrollment(s) cloture(s)');
    }
  }

  private substitute(template: string, ctx: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (m, k) => ctx[k] ?? m);
  }
}
