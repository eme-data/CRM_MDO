import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { computeCyberScore, ScoreInputs, ScoreResult } from './cyber-score.algorithm';

// TTL court : un admin peut activer MFA et vouloir voir le score remonter
// rapidement. 5 min couvre une visite de fiche client confortablement sans
// recalculer a chaque clic.
const SCORE_TTL_SECONDS = 300;
const CACHE_KEY = (companyId: string) => `cyber-score:${companyId}`;

@Injectable()
export class CyberScoreService {
  private readonly logger = new Logger(CyberScoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Calcule le score pour une societe donnee. Cache 5 min (cf SCORE_TTL_SECONDS).
   * Renvoie le ScoreResult + un horodatage `computedAt` pour traçabilite UI.
   */
  async computeForCompany(companyId: string): Promise<ScoreResult & { computedAt: string }> {
    const cacheKey = CACHE_KEY(companyId);
    const cached = this.cache.get<ScoreResult & { computedAt: string }>(cacheKey);
    if (cached) return cached;

    // Verifie l'existence de la societe avant de gather (sinon on perdrait du
    // temps en N queries pour rien).
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Societe introuvable');

    const inputs = await this.gatherInputs(companyId);
    const result = computeCyberScore(inputs);
    const enriched = { ...result, computedAt: new Date().toISOString() };

    this.cache.set(cacheKey, enriched, SCORE_TTL_SECONDS);
    return enriched;
  }

  /**
   * Force le recalcul (invalide le cache). Utile apres une action correctrice
   * (renouvellement asset, activation MFA, etc.) pour voir le score remonter.
   */
  async refresh(companyId: string) {
    this.cache.del(CACHE_KEY(companyId));
    return this.computeForCompany(companyId);
  }

  /**
   * Calcule pour toutes les Companies actives (status=CUSTOMER). Utilise pour
   * la page de vue d'ensemble. NON cache (rare appel admin).
   */
  async computeAllCustomers(): Promise<
    Array<{ companyId: string; companyName: string; score: number | null; level: ScoreResult['level'] }>
  > {
    const customers = await this.prisma.company.findMany({
      where: { status: 'CUSTOMER' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    // Parallelisation bornee : on lance par paquets de 5 pour ne pas saturer
    // Postgres avec 30 societes × 7 queries = 210 reqs simultanees.
    const results: Array<{
      companyId: string;
      companyName: string;
      score: number | null;
      level: ScoreResult['level'];
    }> = [];
    const batchSize = 5;
    for (let i = 0; i < customers.length; i += batchSize) {
      const batch = customers.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (c) => {
          try {
            const r = await this.computeForCompany(c.id);
            return { companyId: c.id, companyName: c.name, score: r.score, level: r.level };
          } catch (err: any) {
            this.logger.warn('Score echec pour ' + c.id + ' : ' + err.message);
            return { companyId: c.id, companyName: c.name, score: null, level: 'NO_DATA' as const };
          }
        }),
      );
      results.push(...batchResults);
    }
    return results;
  }

  /**
   * Gather : execute les requetes Prisma pour reunir les signaux. Sortie
   * fournie en input a la fonction pure computeCyberScore.
   */
  private async gatherInputs(companyId: string): Promise<ScoreInputs> {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 3600_000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600_000);

    const [
      tenant,
      m365Users,
      m365Alerts,
      assetsActive,
      assetsExpired,
      assetsExpiringSoon,
      certsMonitored,
      certsInError,
      certsExpired,
      uptimeMonitors,
      uptimeChecksTotal,
      uptimeChecksUp,
      flexCount,
      docCount,
      netCount,
      locCount,
    ] = await Promise.all([
      // M365 tenant : on selectionne isActive + secureScorePercent en plus du flag.
      // Le secureScorePercent est rempli par le cron M365 quand l'API Graph
      // /security/secureScores est accessible (E3/E5/Business Premium).
      this.prisma.m365Tenant.findUnique({
        where: { companyId },
        select: { id: true, isActive: true, secureScorePercent: true },
      }),
      // Users enabled + MFA
      this.prisma.m365User.aggregate({
        where: { m365Tenant: { companyId }, accountEnabled: true },
        _count: { _all: true },
      }),
      // Open alerts grouped by severity
      this.prisma.m365SecurityAlert.findMany({
        where: {
          m365Tenant: { companyId },
          status: { notIn: ['resolved', 'Resolved', 'RESOLVED'] },
        },
        select: { severity: true },
      }),
      // Assets ACTIVE-status non RETIRED
      this.prisma.asset.count({
        where: { companyId, status: { not: 'RETIRED' } },
      }),
      // Assets expires (status EXPIRED ou expiresAt < now ou warrantyUntil < now)
      this.prisma.asset.count({
        where: {
          companyId,
          status: { not: 'RETIRED' },
          OR: [
            { status: 'EXPIRED' },
            { expiresAt: { lt: now } },
            { warrantyUntil: { lt: now } },
          ],
        },
      }),
      // Assets expirant <30j (et pas deja expires)
      this.prisma.asset.count({
        where: {
          companyId,
          status: 'ACTIVE',
          expiresAt: { gte: now, lte: in30 },
        },
      }),
      // Certs/domains monitores
      this.prisma.asset.count({
        where: {
          companyId,
          type: { in: ['DOMAIN', 'CERTIFICATE'] },
          monitoringEnabled: true,
        },
      }),
      // Certs/domains en erreur de monitoring
      this.prisma.asset.count({
        where: {
          companyId,
          type: { in: ['DOMAIN', 'CERTIFICATE'] },
          monitoringEnabled: true,
          monitoringError: { not: null },
        },
      }),
      // Certs/domains expires
      this.prisma.asset.count({
        where: {
          companyId,
          type: { in: ['DOMAIN', 'CERTIFICATE'] },
          monitoringEnabled: true,
          expiresAt: { lt: now },
        },
      }),
      // Monitors actifs
      this.prisma.uptimeMonitor.count({ where: { companyId, enabled: true } }),
      // Total checks 30j
      this.prisma.uptimeCheck.count({
        where: {
          monitor: { companyId, enabled: true },
          checkedAt: { gte: thirtyDaysAgo },
        },
      }),
      // Checks UP 30j
      this.prisma.uptimeCheck.count({
        where: {
          monitor: { companyId, enabled: true },
          checkedAt: { gte: thirtyDaysAgo },
          isUp: true,
        },
      }),
      // FlexibleAssets count (infra documentee IT Glue-like)
      this.prisma.flexibleAsset.count({ where: { companyId } }),
      // DocPages count (procedures)
      this.prisma.docPage.count({ where: { companyId } }),
      // Networks count
      this.prisma.network.count({ where: { companyId } }),
      // Locations count (cartographie sites)
      this.prisma.location.count({ where: { companyId } }),
    ]);

    // Comptage MFA : on doit faire une 2e requete car aggregate ne supporte
    // pas conditionnel par champ ; mais on peut compter en filtrant mfaEnabled=true.
    const usersWithMfa = tenant
      ? await this.prisma.m365User.count({
          where: { m365Tenant: { companyId }, accountEnabled: true, mfaEnabled: true },
        })
      : 0;

    // Groupement severite alertes (case-insensitive : Graph API peut envoyer
    // "high" ou "High" selon l'API).
    const sev = { high: 0, medium: 0, low: 0 };
    for (const a of m365Alerts) {
      const s = (a.severity ?? '').toLowerCase();
      if (s === 'high') sev.high++;
      else if (s === 'medium') sev.medium++;
      else if (s === 'low' || s === 'informational') sev.low++;
    }

    return {
      m365: {
        tenantConfigured: Boolean(tenant && tenant.isActive),
        enabledUsers: m365Users._count._all,
        usersWithMfa,
        openAlerts: sev,
        secureScorePercent: tenant?.secureScorePercent ?? null,
      },
      assets: {
        activeCount: assetsActive,
        expiredCount: assetsExpired,
        expiringSoonCount: assetsExpiringSoon,
      },
      certificates: {
        monitoredCount: certsMonitored,
        inError: certsInError,
        expired: certsExpired,
      },
      uptime: {
        enabledMonitorsCount: uptimeMonitors,
        upChecks30d: uptimeChecksUp,
        totalChecks30d: uptimeChecksTotal,
      },
      documentation: {
        flexibleAssetsCount: flexCount,
        docPagesCount: docCount,
        // Reseau OU sites = signal "client cartographie"
        networksOrLocationsCount: netCount + locCount,
      },
    };
  }
}
