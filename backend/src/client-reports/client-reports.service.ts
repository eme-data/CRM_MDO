import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  differenceInHours,
} from 'date-fns';
import { ClientReportStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PdfService, MonthlyReportData } from '../pdf/pdf.service';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import { CyberScoreService } from '../cyber-score/cyber-score.service';
import { HealthScoreService } from '../health-score/health-score.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

// Repertoire physique ou sont stockes les PDF (un sous-dossier d'UPLOADS_DIR).
const SUBDIR = 'client-reports';
// Duree de vie du token cryptosecure de download : 30 jours apres generation.
const TOKEN_TTL_DAYS = 30;

@Injectable()
export class ClientReportsService {
  private readonly logger = new Logger(ClientReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
    private readonly cyber: CyberScoreService,
    private readonly health: HealthScoreService,
    private readonly scope: TenantScope,
  ) {}

  private getUploadsDir(): string {
    return this.config.get<string>('uploads.dir') ?? '/app/uploads';
  }

  /**
   * Genere un rapport pour une societe sur un mois donne. Si un rapport pour la
   * meme periode existe deja, retourne l'existant (idempotent au mois pres) sauf
   * si `force = true`.
   */
  /**
   * Generation depuis l'API : assert que companyId appartient au tenant du
   * caller avant d'agir. Le cron interne appelle generateForCompanyInternal
   * directement (mode systeme, scope par tenant via la query company).
   */
  async generateForCompany(
    companyId: string,
    periodStart: Date,
    options: { force?: boolean; generatedById?: string | null },
    me: JwtUser,
  ) {
    await this.scope.assertCompanyInTenant(companyId, me);
    return this.generateForCompanyInternal(companyId, periodStart, options);
  }

  async generateForCompanyInternal(
    companyId: string,
    periodStart: Date,
    options: { force?: boolean; generatedById?: string | null } = {},
  ) {
    const start = startOfMonth(periodStart);
    const end = endOfMonth(periodStart);

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Societe introuvable');

    // Idempotence : on retourne le rapport existant si deja genere ce mois-ci,
    // sauf si l'utilisateur force une regeneration.
    if (!options.force) {
      const existing = await this.prisma.clientReport.findFirst({
        where: { companyId, periodStart: start },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return existing;
    }

    const data = await this.aggregate(company, start, end);
    const pdfBuffer = await this.pdf.monthlyClientReport(data);

    // Stockage sur disque : UPLOADS_DIR/client-reports/YYYY/MM/<uuid>.pdf
    const year = start.getFullYear();
    const month = String(start.getMonth() + 1).padStart(2, '0');
    const filename = randomBytes(16).toString('hex') + '.pdf';
    const relPath = path.posix.join(SUBDIR, String(year), month, filename);
    const fullPath = path.join(this.getUploadsDir(), relPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, pdfBuffer);

    // Token cryptosecure 32 bytes (64 hex chars) — assez large pour resister au
    // brute force sans IP rate-limit specifique (ratelimit global Throttler
    // s'applique sur l'endpoint download).
    const accessToken = randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 3600 * 1000);

    const summary = {
      tickets: data.tickets.resolved + '/' + data.tickets.total,
      interventions: data.interventions.total,
      interventionsDurationMin: data.interventions.totalDurationMin,
      monitored: data.surveillance.monitoredCount,
      alertsSent: data.surveillance.alertsSent,
      uptimeAvgPct: data.uptime.avgUptimePct,
      inventoryTotal: data.inventory.total,
    };

    const report = await this.prisma.clientReport.create({
      data: {
        // Le rapport herite du tenantId de la company
        tenantId: company.tenantId,
        companyId,
        periodStart: start,
        periodEnd: end,
        pdfPath: relPath,
        pdfSize: pdfBuffer.length,
        accessToken,
        tokenExpiresAt,
        summary: summary as unknown as Prisma.InputJsonValue,
        generatedById: options.generatedById ?? null,
      },
    });

    this.logger.log(`Rapport mensuel genere : ${company.name} / ${year}-${month} (${pdfBuffer.length} octets)`);
    return report;
  }

  /**
   * Envoie le lien de telechargement au contact principal de la societe.
   * Renvoie le rapport mis a jour avec sentAt/sentTo/status=SENT.
   */
  async sendByEmail(reportId: string, overrideTo: string | undefined, me: JwtUser | null) {
    const report = await this.prisma.clientReport.findFirst({
      where: me ? this.scope.scopedWhere(me, { id: reportId }) : { id: reportId },
      include: {
        company: {
          include: {
            contacts: { where: { isPrimary: true }, take: 1 },
          },
        },
      },
    });
    if (!report) throw new NotFoundException('Rapport introuvable');

    const to = overrideTo
      ?? report.company.contacts[0]?.email
      ?? report.company.email
      ?? null;
    if (!to) {
      throw new BadRequestException(
        'Aucune adresse email definie pour ce client. Definissez un contact principal ou specifiez un email.',
      );
    }

    const baseUrl = (await this.settings.get('app.publicUrl'))
      ?? (process.env.PUBLIC_URL)
      ?? 'https://crm.mdoservices.fr';
    const link = baseUrl.replace(/\/+$/, '') + '/api/reports/download/' + report.accessToken;
    const monthLabel = report.periodStart.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const expiresLabel = report.tokenExpiresAt.toLocaleDateString('fr-FR');

    const html = `
      <p>Bonjour,</p>
      <p>Votre rapport mensuel MDO Services pour <strong>${monthLabel}</strong> est disponible.</p>
      <p>Vous pouvez le telecharger via le lien securise ci-dessous :</p>
      <p><a href="${link}" style="background:#1d4ed8;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">Telecharger le rapport (PDF)</a></p>
      <p style="color:#64748b;font-size:12px">Ce lien est confidentiel et expire le <strong>${expiresLabel}</strong>. Conservez-le pour vous.</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="color:#64748b;font-size:12px">
        MDO Services - Prestataire IT et Cybersecurite<br>
        <a href="https://www.mdoservices.fr">www.mdoservices.fr</a> - mathieu@mdoservices.fr
      </p>
    `;

    const result = await this.mail.send({
      to,
      subject: `Votre rapport mensuel MDO Services - ${monthLabel}`,
      html,
      relatedEntity: 'ClientReport',
      relatedEntityId: report.id,
      tenantId: report.tenantId,
    });

    if (result.status !== 'SENT') {
      throw new BadRequestException('Envoi mail echoue : ' + (result.error ?? 'inconnu'));
    }

    return this.prisma.clientReport.update({
      where: { id: report.id },
      data: { sentTo: to, sentAt: new Date(), status: ClientReportStatus.SENT },
    });
  }

  /**
   * Resolution du token public : verifie validite + expiration, retourne le
   * chemin physique du PDF et incremente le compteur de telechargements.
   */
  async resolveDownloadToken(token: string) {
    const report = await this.prisma.clientReport.findUnique({
      where: { accessToken: token },
    });
    if (!report) throw new NotFoundException('Lien invalide ou revoque');
    if (report.tokenExpiresAt < new Date()) {
      // On marque expire mais on conserve le report (utile pour audit cote admin).
      if (report.status !== ClientReportStatus.EXPIRED) {
        await this.prisma.clientReport.update({
          where: { id: report.id },
          data: { status: ClientReportStatus.EXPIRED },
        });
      }
      throw new NotFoundException('Ce lien a expire. Contactez MDO Services pour en obtenir un nouveau.');
    }

    await this.prisma.clientReport.update({
      where: { id: report.id },
      data: {
        downloadCount: { increment: 1 },
        lastDownloadAt: new Date(),
        status: report.status === ClientReportStatus.SENT
          ? ClientReportStatus.DOWNLOADED
          : report.status,
      },
    });

    return {
      fullPath: path.join(this.getUploadsDir(), report.pdfPath),
      filename: `rapport-mdo-${report.periodStart.getFullYear()}-${String(report.periodStart.getMonth() + 1).padStart(2, '0')}.pdf`,
    };
  }

  async listForCompany(companyId: string, me: JwtUser) {
    await this.scope.assertCompanyInTenant(companyId, me);
    return this.prisma.clientReport.findMany({
      where: this.scope.scopedWhere(me, { companyId }),
      orderBy: { periodStart: 'desc' },
    });
  }

  async findById(id: string, me: JwtUser) {
    const r = await this.prisma.clientReport.findFirst({
      where: this.scope.scopedWhere(me, { id }),
    });
    if (!r) throw new NotFoundException('Rapport introuvable');
    return r;
  }

  /** Convertit un chemin relatif (stocke dans pdfPath) en chemin absolu sur disque. */
  getFullPath(relPath: string): string {
    return path.join(this.getUploadsDir(), relPath);
  }

  async listAll(params: { limit?: number; status?: ClientReportStatus }, me: JwtUser) {
    const baseWhere = params.status ? { status: params.status } : {};
    return this.prisma.clientReport.findMany({
      where: this.scope.scopedWhere(me, baseWhere),
      orderBy: { createdAt: 'desc' },
      take: params.limit ?? 100,
      include: { company: { select: { id: true, name: true } } },
    });
  }

  async remove(id: string, me: JwtUser) {
    const r = await this.prisma.clientReport.findFirst({
      where: this.scope.scopedWhere(me, { id }),
    });
    if (!r) throw new NotFoundException();
    // On supprime aussi le fichier physique pour eviter l'accumulation sur disque.
    try {
      await fs.unlink(path.join(this.getUploadsDir(), r.pdfPath));
    } catch {
      // Si le fichier a deja ete supprime manuellement, on continue silencieusement.
    }
    return this.prisma.clientReport.delete({ where: { id } });
  }

  /**
   * Cron mensuel : tous les 1ers du mois a 08:00 (heure du serveur, generalement
   * Europe/Paris). Genere les rapports du mois ECOULE pour chaque client actif
   * (status = CUSTOMER) DE CHAQUE TENANT, puis envoie le mail au contact
   * principal. Le job est idempotent : si un rapport existe deja pour la
   * periode, il est reutilise plutot que regenere.
   * Itere par tenant pour respecter le toggle `reports.monthlyAutoSend` du
   * tenant (chacun peut opt-out).
   */
  @Cron('0 8 1 * *', { name: 'monthly-client-reports', timeZone: 'Europe/Paris' })
  async runMonthlyCron() {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const lastMonth = subMonths(new Date(), 1);
    let totalOk = 0, totalFailed = 0;
    for (const t of tenants) {
      try {
        const enabled = await this.settings.getBool('reports.monthlyAutoSend', t.id);
        if (!enabled) {
          this.logger.log('[tenant ' + t.id + '] Cron rapports mensuels : desactive');
          continue;
        }
        const customers = await this.prisma.company.findMany({
          where: { tenantId: t.id, status: 'CUSTOMER' },
          select: { id: true, name: true },
        });
        for (const c of customers) {
          try {
            // Mode systeme : appel direct des methodes internes (le cron n'a
            // pas de JwtUser, on est deja scope par tenantId via la query
            // tenant ci-dessus).
            const report = await this.generateForCompanyInternal(c.id, lastMonth);
            await this.sendByEmail(report.id, undefined, null);
            totalOk++;
          } catch (err: any) {
            totalFailed++;
            this.logger.error(`[tenant ${t.id}] Echec rapport ${c.name} : ${err.message}`);
          }
        }
      } catch (err: any) {
        this.logger.warn('Cron rapports tenant ' + t.id + ' echec : ' + err.message);
      }
    }
    this.logger.log(`Cron rapports mensuels termine : ${totalOk} OK, ${totalFailed} echec(s)`);
  }

  // ============================================================
  // Agregation des donnees pour une periode
  // ============================================================
  private async aggregate(
    company: { id: string; name: string; address: string | null; postalCode: string | null; city: string | null; tenantId: string | null },
    periodStart: Date,
    periodEnd: Date,
  ): Promise<MonthlyReportData> {
    const periodFilter = { gte: periodStart, lte: periodEnd };

    // --- Tickets ---
    // Le SLA est porte par le champ `dueDate` du ticket (echeance ferme).
    // On considere SLA respecte si le ticket a ete resolu avant dueDate.
    const tickets = await this.prisma.ticket.findMany({
      where: {
        companyId: company.id,
        OR: [
          { createdAt: periodFilter },
          { resolvedAt: periodFilter },
        ],
      },
      select: {
        category: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        dueDate: true,
      },
    });
    const resolvedTickets = tickets.filter((t) => t.resolvedAt && t.resolvedAt >= periodStart && t.resolvedAt <= periodEnd);
    const avgResolutionHours = resolvedTickets.length > 0
      ? resolvedTickets.reduce((acc, t) => acc + differenceInHours(t.resolvedAt!, t.createdAt), 0) / resolvedTickets.length
      : null;
    const ticketsWithSla = resolvedTickets.filter((t) => t.dueDate);
    const slaRespected = ticketsWithSla.filter((t) => t.resolvedAt! <= t.dueDate!).length;
    const byCategoryMap = new Map<string, number>();
    for (const t of tickets) byCategoryMap.set(t.category, (byCategoryMap.get(t.category) ?? 0) + 1);

    // --- Interventions ---
    const interventions = await this.prisma.intervention.findMany({
      where: { companyId: company.id, scheduledAt: periodFilter },
      orderBy: { scheduledAt: 'asc' },
      select: { scheduledAt: true, title: true, type: true, durationMin: true },
    });
    const totalDurationMin = interventions.reduce((acc, i) => acc + (i.durationMin ?? 0), 0);

    // --- Surveillance certificats / domaines ---
    const monitorableAssets = await this.prisma.asset.findMany({
      where: {
        companyId: company.id,
        type: { in: ['CERTIFICATE', 'DOMAIN'] },
        monitoringEnabled: true,
      },
      select: { name: true, type: true, expiresAt: true },
    });
    const now = new Date();
    const expiredCount = monitorableAssets.filter((a) => a.expiresAt && a.expiresAt < now).length;
    const expiringIn30 = monitorableAssets.filter((a) => {
      if (!a.expiresAt) return false;
      const days = Math.floor((a.expiresAt.getTime() - now.getTime()) / (24 * 3600 * 1000));
      return days >= 0 && days <= 30;
    }).length;
    const alertsSent = await this.prisma.emailLog.count({
      where: {
        relatedEntity: 'Asset',
        status: 'SENT',
        sentAt: periodFilter,
        // Heuristique : on filtre les alertes qui concernent les assets de ce client.
        // Plus precis : on pourrait lier par relatedEntityId IN (asset.id) mais
        // ca cree une requete enorme. Le count global est suffisant pour le rapport.
        relatedEntityId: { in: (await this.prisma.asset.findMany({
          where: { companyId: company.id },
          select: { id: true },
        })).map((a) => a.id) },
      },
    });
    const surveillanceItems = monitorableAssets
      .filter((a) => a.expiresAt)
      .map((a) => ({
        name: a.name,
        type: a.type as string,
        expiresAt: a.expiresAt,
        daysRemaining: a.expiresAt
          ? Math.floor((a.expiresAt.getTime() - now.getTime()) / (24 * 3600 * 1000))
          : null,
      }))
      .sort((a, b) => (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999))
      .slice(0, 20);

    // --- Uptime ---
    const monitors = await this.prisma.uptimeMonitor.findMany({
      where: { companyId: company.id, enabled: true },
      select: { id: true, name: true, url: true },
    });
    const uptimeList: MonthlyReportData['uptime']['list'] = [];
    let totalUptimePct = 0;
    let totalIncidents = 0;
    for (const m of monitors) {
      const checks = await this.prisma.uptimeCheck.findMany({
        where: { monitorId: m.id, checkedAt: periodFilter },
        select: { isUp: true, checkedAt: true },
        orderBy: { checkedAt: 'asc' },
      });
      let upCount = 0;
      let downCount = 0;
      let incidents = 0;
      let prevUp: boolean | null = null;
      for (const c of checks) {
        if (c.isUp) upCount++;
        else downCount++;
        // Incident = bascule UP → DOWN
        if (prevUp === true && c.isUp === false) incidents++;
        prevUp = c.isUp;
      }
      const total = upCount + downCount;
      const uptimePct = total > 0 ? (upCount / total) * 100 : null;
      if (uptimePct !== null) totalUptimePct += uptimePct;
      totalIncidents += incidents;
      uptimeList.push({ name: m.name, url: m.url, uptimePct, incidents });
    }
    const avgUptimePct = monitors.length > 0 && uptimeList.some((u) => u.uptimePct !== null)
      ? totalUptimePct / uptimeList.filter((u) => u.uptimePct !== null).length
      : null;

    // --- Inventaire complet ---
    const inventory = await this.prisma.asset.findMany({
      where: { companyId: company.id, status: 'ACTIVE' },
      orderBy: { type: 'asc' },
      select: { name: true, type: true, identifier: true, status: true, expiresAt: true },
    });
    const byTypeMap = new Map<string, number>();
    for (const a of inventory) byTypeMap.set(a.type, (byTypeMap.get(a.type) ?? 0) + 1);

    // --- Posture (cyber + health + compliance) ---
    // Best-effort : si l'un des trois echoue (donnees insuffisantes), on
    // continue avec les autres pour ne pas bloquer la generation du rapport.
    // En appel cron, on construit un user systeme dans le tenant de la company
    // pour passer les controles tenant des services cyber/health.
    const systemMe = {
      id: '',
      tenantId: company.tenantId,
      isSuperAdmin: true,
      role: 'ADMIN',
      email: '',
      firstName: '',
      lastName: '',
    } as any;
    const [cyberRes, healthRes, complianceList] = await Promise.all([
      this.cyber.computeForCompany(company.id, systemMe).catch(() => null),
      this.health.computeForCompany(company.id, systemMe).catch(() => null),
      this.prisma.complianceAssessment.findMany({
        where: { companyId: company.id },
        select: {
          framework: { select: { code: true } },
          scorePct: true,
          compliantCount: true,
          nonCompliantCount: true,
          totalControls: true,
        },
      }),
    ]);

    const posture: MonthlyReportData['posture'] = {
      cyberScore: cyberRes?.score ?? null,
      healthScore: healthRes?.overall ?? null,
      healthRisk: healthRes?.risk,
      healthAlerts: healthRes?.alerts ?? [],
      compliance: complianceList.map((c) => ({
        framework: c.framework.code,
        scorePct: c.scorePct,
        compliantCount: c.compliantCount,
        totalControls: c.totalControls,
        nonCompliantCount: c.nonCompliantCount,
      })),
    };

    return {
      company: {
        name: company.name,
        address: company.address,
        postalCode: company.postalCode,
        city: company.city,
      },
      periodStart,
      periodEnd,
      tickets: {
        total: tickets.length,
        resolved: resolvedTickets.length,
        avgResolutionHours,
        slaRespected,
        slaTotal: ticketsWithSla.length,
        byCategory: Array.from(byCategoryMap.entries()).map(([category, count]) => ({ category, count })),
      },
      interventions: {
        total: interventions.length,
        totalDurationMin,
        list: interventions.slice(0, 30),
      },
      surveillance: {
        monitoredCount: monitorableAssets.length,
        expiredCount,
        expiringIn30,
        alertsSent,
        items: surveillanceItems,
      },
      uptime: {
        monitors: monitors.length,
        avgUptimePct,
        incidents: totalIncidents,
        list: uptimeList,
      },
      inventory: {
        total: inventory.length,
        byType: Array.from(byTypeMap.entries()).map(([type, count]) => ({ type, count })),
        list: inventory.slice(0, 60),
      },
      posture,
    };
  }
}
