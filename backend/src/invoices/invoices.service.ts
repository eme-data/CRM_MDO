import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, InvoiceStatus } from '@prisma/client';
import { addDays, startOfMonth, endOfMonth, format } from 'date-fns';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async generateNumber(date: Date): Promise<string> {
    const ym = format(date, 'yyyy-MM');
    const last = await this.prisma.invoice.findFirst({
      where: { number: { startsWith: ym + '-' } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    let next = 1;
    if (last) {
      const m = last.number.match(/-(\d+)$/);
      if (m) next = parseInt(m[1], 10) + 1;
    }
    return ym + '-' + String(next).padStart(4, '0');
  }

  findAll(params: { status?: InvoiceStatus; companyId?: string; from?: string; to?: string }) {
    const where: Prisma.InvoiceWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.companyId) where.companyId = params.companyId;
    if (params.from || params.to) {
      where.issueDate = {};
      if (params.from) (where.issueDate as any).gte = new Date(params.from);
      if (params.to) (where.issueDate as any).lte = new Date(params.to);
    }
    return this.prisma.invoice.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        contract: { select: { id: true, reference: true } },
        lines: true,
      },
      orderBy: { issueDate: 'desc' },
    });
  }

  async findOne(id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        company: true,
        contract: true,
        lines: true,
      },
    });
    if (!inv) throw new NotFoundException('Facture introuvable');
    return inv;
  }

  async create(input: {
    companyId: string;
    contractId?: string;
    issueDate?: Date;
    dueDate?: Date;
    vatRate?: number;
    lines: Array<{ description: string; quantity: number; unitPriceHt: number }>;
    notes?: string;
  }) {
    const issueDate = input.issueDate ?? new Date();
    const dueDate = input.dueDate ?? addDays(issueDate, 30);
    const vatRate = input.vatRate ?? 20;
    const totalHt = input.lines.reduce((s, l) => s + l.quantity * l.unitPriceHt, 0);
    const totalTtc = totalHt * (1 + vatRate / 100);
    const number = await this.generateNumber(issueDate);

    return this.prisma.invoice.create({
      data: {
        number,
        status: 'DRAFT',
        issueDate,
        dueDate,
        vatRate,
        totalHt,
        totalTtc,
        notes: input.notes,
        companyId: input.companyId,
        contractId: input.contractId,
        lines: {
          create: input.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPriceHt: l.unitPriceHt,
            totalHt: l.quantity * l.unitPriceHt,
          })),
        },
      },
      include: { lines: true, company: true },
    });
  }

  /**
   * Aging report : factures impayees groupees par anciennete de la dueDate.
   * Buckets standard B2B : not due / 0-30 / 31-60 / 61-90 / 90+ jours de retard.
   * Sert au pilotage cash flow et a la relance ciblee.
   *
   * On consid?re comme "impayee" toute facture sans paidAt avec un status
   * dans (ISSUED, OVERDUE). DRAFT et CANCELLED sont exclues.
   */
  async aging(): Promise<{
    asOf: string;
    totals: { count: number; totalHt: number; totalTtc: number };
    buckets: Array<{
      key: 'notDue' | 'd0_30' | 'd31_60' | 'd61_90' | 'd90plus';
      label: string;
      count: number;
      totalHt: number;
      totalTtc: number;
      invoices: Array<{
        id: string;
        number: string;
        companyId: string;
        companyName: string;
        issueDate: Date;
        dueDate: Date;
        daysOverdue: number;
        totalHt: number;
        totalTtc: number;
        status: InvoiceStatus;
        externalUrl: string | null;
      }>;
    }>;
  }> {
    const now = new Date();
    const unpaid = await this.prisma.invoice.findMany({
      where: {
        paidAt: null,
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
      },
      include: {
        company: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const buckets = {
      notDue: { key: 'notDue' as const, label: 'A echeance', invoices: [] as any[] },
      d0_30: { key: 'd0_30' as const, label: '0-30 jours de retard', invoices: [] as any[] },
      d31_60: { key: 'd31_60' as const, label: '31-60 jours de retard', invoices: [] as any[] },
      d61_90: { key: 'd61_90' as const, label: '61-90 jours de retard', invoices: [] as any[] },
      d90plus: { key: 'd90plus' as const, label: '90+ jours de retard', invoices: [] as any[] },
    };

    const dayMs = 24 * 3600 * 1000;
    for (const inv of unpaid) {
      const daysOverdue = Math.floor((now.getTime() - inv.dueDate.getTime()) / dayMs);
      const entry = {
        id: inv.id,
        number: inv.number,
        companyId: inv.companyId,
        companyName: inv.company.name,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        daysOverdue: Math.max(0, daysOverdue),
        totalHt: Number(inv.totalHt),
        totalTtc: Number(inv.totalTtc),
        status: inv.status,
        externalUrl: inv.externalUrl,
      };
      if (daysOverdue < 0) buckets.notDue.invoices.push(entry);
      else if (daysOverdue <= 30) buckets.d0_30.invoices.push(entry);
      else if (daysOverdue <= 60) buckets.d31_60.invoices.push(entry);
      else if (daysOverdue <= 90) buckets.d61_90.invoices.push(entry);
      else buckets.d90plus.invoices.push(entry);
    }

    // Calcul des totaux par bucket et globaux
    const out = Object.values(buckets).map((b) => {
      const totalHt = b.invoices.reduce((s, i) => s + i.totalHt, 0);
      const totalTtc = b.invoices.reduce((s, i) => s + i.totalTtc, 0);
      return { ...b, count: b.invoices.length, totalHt, totalTtc };
    });

    const totals = {
      count: unpaid.length,
      totalHt: out.reduce((s, b) => s + b.totalHt, 0),
      totalTtc: out.reduce((s, b) => s + b.totalTtc, 0),
    };

    return { asOf: now.toISOString(), totals, buckets: out };
  }

  async setStatus(id: string, status: InvoiceStatus) {
    const data: Prisma.InvoiceUpdateInput = { status };
    if (status === 'PAID') data.paidAt = new Date();
    return this.prisma.invoice.update({ where: { id }, data });
  }

  async remove(id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException();
    if (inv.status !== 'DRAFT') {
      throw new Error('Seules les factures DRAFT peuvent etre supprimees');
    }
    await this.prisma.invoice.delete({ where: { id } });
    return { success: true };
  }

  // ============= Cron mensuel : generation auto a partir des contrats actifs =============
  // Desactive automatiquement quand un provider externe (Qonto) est
  // actif ET que billing.disableInternalCron est a true (defaut). Dans ce
  // mode, c'est le provider externe qui est la source de verite des factures.
  @Cron('0 6 1 * *') // 1er du mois a 6h
  async generateMonthlyInvoicesAuto() {
    const provider = (await this.settings.get('billing.provider')) ?? 'none';
    const disableInternal = await this.settings.getBool('billing.disableInternalCron');
    if (provider !== 'none' && disableInternal) {
      this.logger.log(
        'Cron interne ignore : provider externe "' + provider + '" actif (billing.disableInternalCron=true)',
      );
      return { created: 0, skipped: true, reason: 'external_provider_' + provider };
    }

    const now = new Date();
    const issueDate = startOfMonth(now);
    this.logger.log('Generation mensuelle des factures pour ' + format(issueDate, 'yyyy-MM'));

    const contracts = await this.prisma.contract.findMany({
      where: {
        status: 'ACTIVE',
        billingPeriod: 'MONTHLY',
        startDate: { lte: now },
        endDate: { gte: now },
      },
      include: { company: true },
    });

    let created = 0;
    for (const c of contracts) {
      // Ne pas dupliquer : check facture existante pour ce contrat ce mois-ci
      const existing = await this.prisma.invoice.findFirst({
        where: {
          contractId: c.id,
          issueDate: { gte: issueDate, lte: endOfMonth(issueDate) },
        },
      });
      if (existing) continue;

      const description =
        'Abonnement ' + c.offer + ' - ' + format(issueDate, 'MMM yyyy') +
        ' (' + c.quantity + ' utilisateur' + (c.quantity > 1 ? 's' : '') + ')';

      try {
        await this.create({
          companyId: c.companyId,
          contractId: c.id,
          issueDate,
          dueDate: addDays(issueDate, 30),
          vatRate: Number(c.vatRate),
          lines: [{
            description,
            quantity: c.quantity,
            unitPriceHt: Number(c.unitPriceHt),
          }],
        });
        created++;
      } catch (err: any) {
        this.logger.error('Echec facture pour contrat ' + c.reference + ' : ' + err.message);
      }
    }
    this.logger.log(created + ' factures creees');
    return { created };
  }
}
