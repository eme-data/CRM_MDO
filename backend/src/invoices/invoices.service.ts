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
  // Desactive automatiquement quand un provider externe (Sellsy/Qonto) est
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
