import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../common/cache/cache.service';
import { SettingsService } from '../settings/settings.service';

const TTL_SECONDS = 600;
const CACHE_KEY = (id: string, m: number) => 'profitability:' + id + ':' + m;

export interface ProfitabilityResult {
  companyId: string;
  periodMonths: number;
  // Revenus
  contractRevenue: number;       // sum(contract.monthlyAmountHt) * periodMonths
  billableTimeRevenue: number;   // billable hours × billing rate
  totalRevenue: number;
  // Couts
  internalCost: number;          // toutes les heures (billable + non) × hourly rate
  hoursBillable: number;
  hoursNonBillable: number;
  totalHours: number;
  // Resultat
  margin: number;
  marginPct: number;
  // Verdict simple pour UI
  flag: 'PROFITABLE' | 'BREAK_EVEN' | 'LOSS';
  computedAt: string;
}

@Injectable()
export class ProfitabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly settings: SettingsService,
  ) {}

  async computeForCompany(companyId: string, periodMonths = 12): Promise<ProfitabilityResult> {
    const cached = this.cache.get<ProfitabilityResult>(CACHE_KEY(companyId, periodMonths));
    if (cached) return cached;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Societe introuvable');

    const since = new Date(Date.now() - periodMonths * 30 * 86400_000);

    const defaultHourlyRate = parseFloat((await this.settings.get('profitability.defaultHourlyRate')) ?? '45');
    const defaultBillingRate = parseFloat((await this.settings.get('profitability.defaultBillingRate')) ?? '90');

    const [activeContracts, timeEntries] = await Promise.all([
      this.prisma.contract.findMany({
        where: { companyId, status: 'ACTIVE' },
        select: { monthlyAmountHt: true },
      }),
      this.prisma.timeEntry.findMany({
        where: {
          OR: [
            { companyId },
            { ticket: { companyId } },
            { intervention: { companyId } },
            { contract: { companyId } },
          ],
          startedAt: { gte: since },
          durationMin: { not: null },
        },
        select: {
          durationMin: true,
          billable: true,
          hourlyRateHt: true,
          user: { select: { hourlyRate: true } },
        },
      }),
    ]);

    // ----- Revenus contrats (annualises sur la periode) -----
    const monthlyMrr = activeContracts.reduce((s, c) => s + Number(c.monthlyAmountHt), 0);
    const contractRevenue = +(monthlyMrr * periodMonths).toFixed(2);

    // ----- Revenus time-billing -----
    let billableTimeRevenue = 0;
    let hoursBillable = 0;
    let hoursNonBillable = 0;
    let internalCost = 0;
    for (const te of timeEntries) {
      const hours = (te.durationMin ?? 0) / 60;
      if (te.billable) {
        hoursBillable += hours;
        const rate = te.hourlyRateHt ? Number(te.hourlyRateHt) : defaultBillingRate;
        billableTimeRevenue += hours * rate;
      } else {
        hoursNonBillable += hours;
      }
      const cost = (te.user?.hourlyRate ? Number(te.user.hourlyRate) : defaultHourlyRate) * hours;
      internalCost += cost;
    }
    billableTimeRevenue = +billableTimeRevenue.toFixed(2);
    internalCost = +internalCost.toFixed(2);
    const totalRevenue = +(contractRevenue + billableTimeRevenue).toFixed(2);
    const margin = +(totalRevenue - internalCost).toFixed(2);
    const marginPct = totalRevenue > 0 ? +((margin / totalRevenue) * 100).toFixed(1) : 0;
    const flag: ProfitabilityResult['flag'] =
      marginPct > 20 ? 'PROFITABLE' : marginPct >= 0 ? 'BREAK_EVEN' : 'LOSS';

    const result: ProfitabilityResult = {
      companyId,
      periodMonths,
      contractRevenue,
      billableTimeRevenue,
      totalRevenue,
      internalCost,
      hoursBillable: +hoursBillable.toFixed(1),
      hoursNonBillable: +hoursNonBillable.toFixed(1),
      totalHours: +(hoursBillable + hoursNonBillable).toFixed(1),
      margin,
      marginPct,
      flag,
      computedAt: new Date().toISOString(),
    };

    this.cache.set(CACHE_KEY(companyId, periodMonths), result, TTL_SECONDS);
    return result;
  }

  async overview(periodMonths = 12) {
    const customers = await this.prisma.company.findMany({
      where: { status: 'CUSTOMER' },
      select: { id: true, name: true },
      take: 200,
    });
    const items = await Promise.all(
      customers.map(async (c) => {
        const r = await this.computeForCompany(c.id, periodMonths);
        return { ...r, name: c.name };
      }),
    );
    // Tri par marge croissante (les pertes en premier — ce qui mobilise l'attention)
    return items.sort((a, b) => a.marginPct - b.marginPct);
  }
}
