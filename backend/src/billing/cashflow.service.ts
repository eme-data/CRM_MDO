import { Injectable } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

// Vue cash flow consolidee : encaissements attendus (factures non payees groupees
// par horizon de dueDate) + flux historiques bancaires Qonto (30j) + solde net.
//
// Pas de "MRR projeté" theorique pour rester sur du factuel : on n'extrapole
// pas les contrats recurrents (cela serait double-comptabilise quand les factures
// auront ete generees + poussees vers Sellsy/Qonto).

@Injectable()
export class CashFlowService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<{
    asOf: string;
    expectedIn: {
      next30Days: { count: number; totalTtc: number };
      next60Days: { count: number; totalTtc: number };
      next90Days: { count: number; totalTtc: number };
    };
    historical: {
      last30Days: {
        creditTotal: number;
        debitTotal: number;
        net: number;
        creditCount: number;
        debitCount: number;
      };
    };
    upcomingInvoices: Array<{
      id: string;
      number: string;
      companyName: string;
      dueDate: Date;
      totalTtc: number;
      daysUntilDue: number;
    }>;
  }> {
    const now = new Date();
    const dayMs = 24 * 3600 * 1000;
    const in30 = new Date(now.getTime() + 30 * dayMs);
    const in60 = new Date(now.getTime() + 60 * dayMs);
    const in90 = new Date(now.getTime() + 90 * dayMs);
    const ago30 = new Date(now.getTime() - 30 * dayMs);

    const [
      upcoming30Agg,
      upcoming60Agg,
      upcoming90Agg,
      bankCreditAgg,
      bankDebitAgg,
      upcomingTop,
    ] = await Promise.all([
      // Factures dues dans les 30 prochains jours (cumulees pour 60/90 par sous-requete)
      this.prisma.invoice.aggregate({
        where: {
          paidAt: null,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
          dueDate: { gte: now, lte: in30 },
        },
        _count: { _all: true },
        _sum: { totalTtc: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          paidAt: null,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
          dueDate: { gte: now, lte: in60 },
        },
        _count: { _all: true },
        _sum: { totalTtc: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          paidAt: null,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
          dueDate: { gte: now, lte: in90 },
        },
        _count: { _all: true },
        _sum: { totalTtc: true },
      }),
      // Credits Qonto 30 derniers jours
      this.prisma.bankTransaction.aggregate({
        where: { side: 'CREDIT', bookedAt: { gte: ago30 } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      // Debits Qonto 30 derniers jours
      this.prisma.bankTransaction.aggregate({
        where: { side: 'DEBIT', bookedAt: { gte: ago30 } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      // Top 10 prochaines echeances pour visualisation immediate
      this.prisma.invoice.findMany({
        where: {
          paidAt: null,
          status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
          dueDate: { gte: now, lte: in90 },
        },
        include: { company: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
    ]);

    const creditTotal = Number(bankCreditAgg._sum.amount ?? 0);
    const debitTotal = Number(bankDebitAgg._sum.amount ?? 0);

    return {
      asOf: now.toISOString(),
      expectedIn: {
        next30Days: {
          count: upcoming30Agg._count._all,
          totalTtc: Number(upcoming30Agg._sum.totalTtc ?? 0),
        },
        next60Days: {
          count: upcoming60Agg._count._all,
          totalTtc: Number(upcoming60Agg._sum.totalTtc ?? 0),
        },
        next90Days: {
          count: upcoming90Agg._count._all,
          totalTtc: Number(upcoming90Agg._sum.totalTtc ?? 0),
        },
      },
      historical: {
        last30Days: {
          creditTotal,
          debitTotal,
          net: creditTotal - debitTotal,
          creditCount: bankCreditAgg._count._all,
          debitCount: bankDebitAgg._count._all,
        },
      },
      upcomingInvoices: upcomingTop.map((inv) => ({
        id: inv.id,
        number: inv.number,
        companyName: inv.company.name,
        dueDate: inv.dueDate,
        totalTtc: Number(inv.totalTtc),
        daysUntilDue: Math.ceil((inv.dueDate.getTime() - now.getTime()) / dayMs),
      })),
    };
  }
}
