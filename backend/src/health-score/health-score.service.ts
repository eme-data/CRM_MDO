import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { CacheService } from '../common/cache/cache.service';
import { CyberScoreService } from '../cyber-score/cyber-score.service';

// Customer Health Score = score d'engagement / risque de churn par client.
// 0-100, plus c'est haut mieux c'est. Compose de 5 dimensions ponderees :
//
//   support     (25 pts) — tickets resolus + temps resolution
//   financial   (20 pts) — pas de factures impayees
//   engagement  (20 pts) — interventions recentes + contrats actifs
//   nps         (15 pts) — derniere note NPS
//   cyber       (20 pts) — cyber-score (deja calcule)
//
// Calcul a la volee, pas de modele DB (cache 10 min). Si tu veux historique,
// il faudra ajouter un cron quotidien snapshot — pas necessaire pour le MVP.

const TTL_SECONDS = 600;
const CACHE_KEY = (id: string) => 'health-score:' + id;

export type HealthRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export interface DimensionScore {
  score: number;       // 0-100
  weight: number;      // 0-1
  weighted: number;    // score * weight
  details: Record<string, any>;
}

export interface HealthScoreResult {
  overall: number;
  risk: HealthRisk;
  dimensions: {
    support: DimensionScore;
    financial: DimensionScore;
    engagement: DimensionScore;
    nps: DimensionScore;
    cyber: DimensionScore;
  };
  alerts: string[]; // raisons text qui font baisser le score, pour affichage
  computedAt: string;
}

const WEIGHTS = {
  support: 0.25,
  financial: 0.20,
  engagement: 0.20,
  nps: 0.15,
  cyber: 0.20,
};

@Injectable()
export class HealthScoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
    private readonly cache: CacheService,
    private readonly cyber: CyberScoreService,
  ) {}

  async computeForCompany(companyId: string, me: JwtUser): Promise<HealthScoreResult> {
    await this.scope.assertCompanyInTenant(companyId, me);
    const cached = this.cache.get<HealthScoreResult>(CACHE_KEY(companyId));
    if (cached) return cached;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, status: true },
    });
    if (!company) throw new NotFoundException('Societe introuvable');

    const since90 = new Date(Date.now() - 90 * 86400_000);
    const since30 = new Date(Date.now() - 30 * 86400_000);

    const [tickets, openTickets, invoicesUnpaid, invoicesOverdue, lastIntervention, activeContracts, lastNps, cyber] =
      await Promise.all([
        this.prisma.ticket.findMany({
          where: { companyId, createdAt: { gte: since90 } },
          select: { status: true, resolvedAt: true, createdAt: true, dueDate: true, priority: true },
        }),
        this.prisma.ticket.count({
          where: { companyId, status: { notIn: ['RESOLVED', 'CLOSED', 'CANCELLED'] } },
        }),
        this.prisma.invoice.count({
          where: { companyId, paidAt: null, status: { in: ['ISSUED', 'OVERDUE'] } },
        }),
        this.prisma.invoice.findMany({
          where: { companyId, paidAt: null, dueDate: { lt: new Date() } },
          select: { totalTtc: true, dueDate: true },
        }),
        this.prisma.intervention.findFirst({
          where: { companyId },
          orderBy: { scheduledAt: 'desc' },
          select: { scheduledAt: true },
        }),
        this.prisma.contract.count({ where: { companyId, status: 'ACTIVE' } }),
        this.prisma.ticketSatisfaction.findFirst({
          where: { ticket: { companyId }, score: { not: null } },
          orderBy: { submittedAt: 'desc' },
          select: { score: true, submittedAt: true },
        }).catch(() => null),
        this.cyber.computeForCompany(companyId, me).catch(() => null),
      ]);

    const alerts: string[] = [];

    // ---------- Support (25) ----------
    let supportScore = 100;
    const ticketDetails: Record<string, any> = {
      total90d: tickets.length,
      open: openTickets,
      avgResolutionH: null as number | null,
    };
    if (openTickets > 5) {
      supportScore -= 30;
      alerts.push(openTickets + ' tickets ouverts — risque de saturation');
    } else if (openTickets > 2) {
      supportScore -= 10;
    }
    const overdueTickets = tickets.filter(
      (t) => t.dueDate && new Date(t.dueDate) < new Date() && !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(t.status),
    ).length;
    if (overdueTickets > 0) {
      supportScore -= overdueTickets * 10;
      alerts.push(overdueTickets + ' ticket(s) en depassement SLA');
    }
    const resolved = tickets.filter((t) => t.resolvedAt);
    if (resolved.length > 0) {
      const avgMs =
        resolved.reduce((s, t) => s + (t.resolvedAt!.getTime() - t.createdAt.getTime()), 0) / resolved.length;
      const avgH = avgMs / 3_600_000;
      ticketDetails.avgResolutionH = +avgH.toFixed(1);
      if (avgH > 72) {
        supportScore -= 15;
        alerts.push('Temps moyen resolution > 72h sur 90 derniers jours');
      }
    }
    supportScore = Math.max(0, Math.min(100, supportScore));

    // ---------- Financial (20) ----------
    let financialScore = 100;
    const finDetails: Record<string, any> = {
      unpaidCount: invoicesUnpaid,
      overdueCount: invoicesOverdue.length,
      overdueAmount: invoicesOverdue.reduce((s, i) => s + Number(i.totalTtc), 0),
    };
    if (invoicesOverdue.length > 0) {
      financialScore -= 30 + Math.min(40, invoicesOverdue.length * 10);
      alerts.push(invoicesOverdue.length + ' facture(s) en retard de paiement');
    } else if (invoicesUnpaid > 3) {
      financialScore -= 15;
    }
    financialScore = Math.max(0, Math.min(100, financialScore));

    // ---------- Engagement (20) ----------
    let engagementScore = 100;
    const engDetails: Record<string, any> = {
      activeContracts,
      lastInterventionAt: lastIntervention?.scheduledAt ?? null,
      daysSinceLastIntervention: lastIntervention
        ? Math.floor((Date.now() - lastIntervention.scheduledAt.getTime()) / 86400_000)
        : null,
    };
    if (activeContracts === 0 && company.status === 'CUSTOMER') {
      engagementScore -= 50;
      alerts.push('Aucun contrat actif sur ce client classe CUSTOMER');
    }
    if (engDetails.daysSinceLastIntervention === null) {
      engagementScore -= 20;
      alerts.push('Aucune intervention enregistree');
    } else if (engDetails.daysSinceLastIntervention > 90) {
      engagementScore -= 30;
      alerts.push('Aucune intervention depuis ' + engDetails.daysSinceLastIntervention + ' jours');
    } else if (engDetails.daysSinceLastIntervention > 60) {
      engagementScore -= 10;
    }
    engagementScore = Math.max(0, Math.min(100, engagementScore));

    // ---------- NPS (15) ----------
    let npsScore = 70; // neutre si pas de retour client
    const npsDetails: Record<string, any> = {
      lastScore: lastNps?.score ?? null,
      lastAt: lastNps?.submittedAt ?? null,
    };
    if (lastNps?.score != null) {
      // NPS 0-10 -> score 0-100
      npsScore = lastNps.score * 10;
      if (lastNps.score <= 6) {
        alerts.push('Dernier NPS = ' + lastNps.score + '/10 (detracteur)');
      }
    }

    // ---------- Cyber (20) ----------
    const cyberScoreVal: number = cyber?.score ?? 60; // neutre si non calculable
    if (cyberScoreVal < 50) {
      alerts.push('Cyber-score bas (' + cyberScoreVal + '/100)');
    }

    const dim = (s: number, w: number, details: Record<string, any>): DimensionScore => ({
      score: Math.round(s),
      weight: w,
      weighted: +(s * w).toFixed(1),
      details,
    });

    const dimensions = {
      support: dim(supportScore, WEIGHTS.support, ticketDetails),
      financial: dim(financialScore, WEIGHTS.financial, finDetails),
      engagement: dim(engagementScore, WEIGHTS.engagement, engDetails),
      nps: dim(npsScore, WEIGHTS.nps, npsDetails),
      cyber: dim(cyberScoreVal, WEIGHTS.cyber, { score: cyberScoreVal }),
    };

    const overall = Math.round(
      dimensions.support.weighted +
        dimensions.financial.weighted +
        dimensions.engagement.weighted +
        dimensions.nps.weighted +
        dimensions.cyber.weighted,
    );

    const risk: HealthRisk = overall < 50 ? 'HIGH' : overall < 70 ? 'MEDIUM' : 'LOW';

    const result: HealthScoreResult = {
      overall,
      risk,
      dimensions,
      alerts,
      computedAt: new Date().toISOString(),
    };

    this.cache.set(CACHE_KEY(companyId), result, TTL_SECONDS);
    return result;
  }

  // Vue d'ensemble : top N clients a risque (HIGH ou MEDIUM) - scope par tenant
  async overview(me: JwtUser, limit = 50) {
    const companies = await this.prisma.company.findMany({
      where: this.scope.scopedWhere(me, { status: 'CUSTOMER' }),
      select: { id: true, name: true },
      take: 200, // limite haute pour eviter d'exploser le compute si beaucoup de clients
    });
    const scores = await Promise.all(
      companies.map(async (c) => {
        const s = await this.computeForCompany(c.id, me);
        return { companyId: c.id, name: c.name, overall: s.overall, risk: s.risk, alerts: s.alerts.length };
      }),
    );
    return scores
      .sort((a, b) => a.overall - b.overall) // les plus a risque en premier
      .slice(0, limit);
  }
}
