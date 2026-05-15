import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../common/cache/cache.service';

const TTL_SECONDS = 3600; // 1h
const CACHE_KEY = 'executive:snapshot';

export interface ExecSnapshot {
  asOf: string;
  // ----- Revenus recurrents -----
  mrrHt: number;
  mrrPrevHt: number;
  mrrGrowthPct: number;
  arrHt: number;
  // ----- Clients -----
  activeCustomers: number;
  newCustomers30d: number;
  arpu: number;                 // MRR / activeCustomers
  // ----- Bookings & activite commerciale -----
  newContracts30d: number;
  bookingsAmount30d: number;    // somme MRR contrats ACTIVE crees ces 30j
  pipelineHt: number;           // opportunites non cloturees (amountHt × probability)
  quotesPipelineHt: number;     // somme totalTtc des quotes SENT
  // ----- Churn -----
  terminatedCount30d: number;
  churnRatePct: number;
  // ----- Profitabilite globale -----
  totalContractRevenue12m: number;
  // ----- LTV approximatif -----
  avgClientAgeMonths: number;
  ltv: number;                  // ARPU × avgClientAgeMonths
  // ----- Top 5 clients par MRR -----
  topClientsMrr: Array<{ companyId: string; name: string; mrrHt: number; contracts: number }>;
  // ----- Repartition par offre -----
  mrrByOffer: Array<{ offer: string; count: number; mrrHt: number }>;
}

@Injectable()
export class ExecutiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async snapshot(): Promise<ExecSnapshot> {
    const cached = this.cache.get<ExecSnapshot>(CACHE_KEY);
    if (cached) return cached;

    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 86400_000);

    // ----- MRR actuel : tous les contrats ACTIVE -----
    const activeContracts = await this.prisma.contract.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true, monthlyAmountHt: true, offer: true, signedAt: true, createdAt: true, startDate: true,
        company: { select: { id: true, name: true, status: true, createdAt: true } },
      },
    });
    const mrrHt = activeContracts.reduce((s, c) => s + Number(c.monthlyAmountHt), 0);

    // ----- MRR M-1 : contrats qui etaient ACTIVE il y a 30 jours -----
    // Approximation : ACTIVE aujourd'hui dont startDate < d30, MOINS bookings
    // 30 derniers jours, PLUS terminated 30 derniers jours.
    const startedBefore30 = activeContracts.filter((c) => c.startDate < d30);
    const terminatedLast30 = await this.prisma.contract.findMany({
      where: { status: 'TERMINATED', terminatedAt: { gte: d30 } },
      select: { monthlyAmountHt: true },
    });
    const mrrPrevHt = +(
      startedBefore30.reduce((s, c) => s + Number(c.monthlyAmountHt), 0) +
      terminatedLast30.reduce((s, c) => s + Number(c.monthlyAmountHt), 0)
    ).toFixed(2);
    const mrrGrowthPct = mrrPrevHt > 0 ? +(((mrrHt - mrrPrevHt) / mrrPrevHt) * 100).toFixed(1) : 0;

    // ----- Clients actifs -----
    const activeCustomers = await this.prisma.company.count({ where: { status: 'CUSTOMER' } });
    const newCustomers30d = await this.prisma.company.count({
      where: { status: 'CUSTOMER', createdAt: { gte: d30 } },
    });

    // ----- Bookings -----
    const newContracts30 = activeContracts.filter((c) => c.createdAt >= d30);
    const bookingsAmount30d = +newContracts30.reduce((s, c) => s + Number(c.monthlyAmountHt), 0).toFixed(2);

    // ----- Pipeline -----
    const opps = await this.prisma.opportunity.findMany({
      where: { stage: { in: ['QUALIFICATION', 'PROPOSITION', 'NEGOCIATION'] } },
      select: { amountHt: true, probability: true },
    });
    const pipelineHt = +opps.reduce((s, o) => s + Number(o.amountHt) * (o.probability / 100), 0).toFixed(2);

    const sentQuotes = await this.prisma.quote.aggregate({
      where: { status: 'SENT' },
      _sum: { totalTtc: true },
    });
    const quotesPipelineHt = Number(sentQuotes._sum.totalTtc ?? 0);

    // ----- Churn -----
    // Denominateur : contrats ACTIVE au debut de la periode (= active actuel + terminated du mois)
    const denominator = activeContracts.length + terminatedLast30.length;
    const churnRatePct = denominator > 0 ? +((terminatedLast30.length / denominator) * 100).toFixed(2) : 0;

    // ----- Total revenus contrats sur 12 mois (annualise) -----
    const totalContractRevenue12m = +(mrrHt * 12).toFixed(2);

    // ----- Anciennete moyenne client -----
    const customers = await this.prisma.company.findMany({
      where: { status: 'CUSTOMER' },
      select: { createdAt: true },
    });
    const avgAgeDays = customers.length > 0
      ? customers.reduce((s, c) => s + (now.getTime() - c.createdAt.getTime()) / 86400_000, 0) / customers.length
      : 0;
    const avgClientAgeMonths = +(avgAgeDays / 30).toFixed(1);

    // ----- Top 5 clients par MRR -----
    const byCompany = new Map<string, { companyId: string; name: string; mrrHt: number; contracts: number }>();
    for (const c of activeContracts) {
      const e = byCompany.get(c.company.id) ?? { companyId: c.company.id, name: c.company.name, mrrHt: 0, contracts: 0 };
      e.mrrHt += Number(c.monthlyAmountHt);
      e.contracts += 1;
      byCompany.set(c.company.id, e);
    }
    const topClientsMrr = Array.from(byCompany.values())
      .sort((a, b) => b.mrrHt - a.mrrHt)
      .slice(0, 5)
      .map((c) => ({ ...c, mrrHt: +c.mrrHt.toFixed(2) }));

    // ----- ARPU + LTV -----
    const arpu = activeCustomers > 0 ? +(mrrHt / activeCustomers).toFixed(2) : 0;
    const ltv = +(arpu * avgClientAgeMonths).toFixed(2);

    // ----- Repartition MRR par offre -----
    const byOffer = new Map<string, { offer: string; count: number; mrrHt: number }>();
    for (const c of activeContracts) {
      const e = byOffer.get(c.offer) ?? { offer: c.offer, count: 0, mrrHt: 0 };
      e.count += 1;
      e.mrrHt += Number(c.monthlyAmountHt);
      byOffer.set(c.offer, e);
    }
    const mrrByOffer = Array.from(byOffer.values())
      .map((o) => ({ ...o, mrrHt: +o.mrrHt.toFixed(2) }))
      .sort((a, b) => b.mrrHt - a.mrrHt);

    const result: ExecSnapshot = {
      asOf: now.toISOString(),
      mrrHt: +mrrHt.toFixed(2),
      mrrPrevHt,
      mrrGrowthPct,
      arrHt: +(mrrHt * 12).toFixed(2),
      activeCustomers,
      newCustomers30d,
      arpu,
      newContracts30d: newContracts30.length,
      bookingsAmount30d,
      pipelineHt,
      quotesPipelineHt,
      terminatedCount30d: terminatedLast30.length,
      churnRatePct,
      totalContractRevenue12m,
      avgClientAgeMonths,
      ltv,
      topClientsMrr,
      mrrByOffer,
    };

    this.cache.set(CACHE_KEY, result, TTL_SECONDS);
    return result;
  }
}
