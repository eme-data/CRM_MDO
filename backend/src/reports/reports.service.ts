import { Injectable } from '@nestjs/common';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // Evolution du MRR (montant mensuel recurrent) sur 12 mois
  async mrrTrend() {
    const months = 12;
    const today = new Date();
    const points: Array<{ month: string; mrrHt: number; activeContracts: number }> = [];
    for (let i = months - 1; i >= 0; i--) {
      const ref = startOfMonth(subMonths(today, i));
      const end = endOfMonth(ref);
      const contracts = await this.prisma.contract.findMany({
        where: {
          startDate: { lte: end },
          OR: [{ endDate: { gte: ref } }, { endDate: null as any }],
          status: { in: ['ACTIVE', 'EXPIRED', 'TERMINATED', 'RENEWED'] },
        },
        select: { monthlyAmountHt: true, status: true, endDate: true },
      });
      // Filtrer ceux qui etaient ACTIFS pendant ce mois (status au mois donne)
      let mrr = 0;
      let count = 0;
      for (const c of contracts) {
        if (c.endDate && c.endDate < ref) continue;
        mrr += Number(c.monthlyAmountHt);
        count++;
      }
      points.push({
        month: format(ref, 'yyyy-MM'),
        mrrHt: Math.round(mrr * 100) / 100,
        activeContracts: count,
      });
    }
    return points;
  }

  // Top clients par chiffre d'affaires recurrent + nb tickets
  async topClients(limit = 10) {
    const contracts = await this.prisma.contract.groupBy({
      by: ['companyId'],
      where: { status: 'ACTIVE' },
      _sum: { monthlyAmountHt: true },
      _count: true,
    });
    const tickets = await this.prisma.ticket.groupBy({
      by: ['companyId'],
      _count: true,
    });
    const ticketMap = new Map(tickets.map((t) => [t.companyId, t._count]));

    const ids = contracts.map((c) => c.companyId);
    const companies = await this.prisma.company.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const cmap = new Map(companies.map((c) => [c.id, c.name]));

    return contracts
      .map((c) => ({
        companyId: c.companyId,
        companyName: cmap.get(c.companyId) ?? 'inconnu',
        mrrHt: Number(c._sum.monthlyAmountHt ?? 0),
        contractCount: c._count,
        ticketCount: ticketMap.get(c.companyId) ?? 0,
      }))
      .sort((a, b) => b.mrrHt - a.mrrHt)
      .slice(0, limit);
  }

  // Taux de respect SLA sur N derniers jours
  async slaRespect(days = 30) {
    const since = subMonths(new Date(), 1);
    const tickets = await this.prisma.ticket.findMany({
      where: {
        status: { in: ['RESOLVED', 'CLOSED'] },
        resolvedAt: { gte: since },
        dueDate: { not: null },
      },
      select: { dueDate: true, resolvedAt: true, priority: true },
    });
    let respected = 0;
    for (const t of tickets) {
      if (t.dueDate && t.resolvedAt && t.resolvedAt <= t.dueDate) respected++;
    }
    const total = tickets.length;
    const rate = total === 0 ? 100 : Math.round((respected / total) * 100);
    return { total, respected, breached: total - respected, ratePercent: rate };
  }

  // Pipeline value par etape
  async pipeline() {
    const stages = ['QUALIFICATION', 'PROPOSITION', 'NEGOCIATION', 'GAGNE', 'PERDU'];
    const data = await Promise.all(
      stages.map(async (stage) => {
        const agg = await this.prisma.opportunity.aggregate({
          where: { stage: stage as any },
          _sum: { amountHt: true },
          _count: true,
        });
        return {
          stage,
          count: agg._count,
          totalHt: Number(agg._sum.amountHt ?? 0),
        };
      }),
    );
    return data;
  }

  // Temps facturable par technicien sur 30 derniers jours
  async timeByTech(days = 30) {
    const since = subMonths(new Date(), 1);
    const entries = await this.prisma.timeEntry.findMany({
      where: { startedAt: { gte: since }, endedAt: { not: null } },
      select: {
        durationMin: true,
        billable: true,
        userId: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    const map: Record<string, { name: string; totalMin: number; billableMin: number }> = {};
    for (const e of entries) {
      if (!map[e.userId]) {
        map[e.userId] = {
          name: e.user.firstName + ' ' + e.user.lastName,
          totalMin: 0,
          billableMin: 0,
        };
      }
      map[e.userId].totalMin += e.durationMin ?? 0;
      if (e.billable) map[e.userId].billableMin += e.durationMin ?? 0;
    }
    return Object.values(map).sort((a, b) => b.totalMin - a.totalMin);
  }

  // CA factures par mois sur 12 mois
  async revenueTrend() {
    const months = 12;
    const today = new Date();
    const points: Array<{ month: string; ht: number; ttc: number; count: number }> = [];
    for (let i = months - 1; i >= 0; i--) {
      const start = startOfMonth(subMonths(today, i));
      const end = endOfMonth(start);
      const agg = await this.prisma.invoice.aggregate({
        where: {
          issueDate: { gte: start, lte: end },
          status: { in: ['ISSUED', 'PAID'] },
        },
        _sum: { totalHt: true, totalTtc: true },
        _count: true,
      });
      points.push({
        month: format(start, 'yyyy-MM'),
        ht: Number(agg._sum.totalHt ?? 0),
        ttc: Number(agg._sum.totalTtc ?? 0),
        count: agg._count,
      });
    }
    return points;
  }
}
