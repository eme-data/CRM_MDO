import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, QuoteStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { ConvertQuoteDto } from './dto/convert-quote.dto';
import { QuoteLineDto } from './dto/quote-line.dto';
import { WebhooksService } from '../webhooks/webhooks.service';

interface ComputedLine {
  position: number;
  description: string;
  quantity: number;
  unitPriceHt: number;
  discountPct: number;
  lineTotalHt: number;
  productId?: string | null;
  purchasePriceHtSnapshot?: number | null;
}

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
  ) {}

  // ============================================================
  // Generation reference DEV-YYYY-NNNN (calque sur Contract.reference)
  // ============================================================
  async generateReference(tenantId: string | null): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `DEV-${year}-`;
    // Multi-tenant : sequence par tenant.
    const last = await this.prisma.quote.findFirst({
      where: { tenantId, reference: { startsWith: prefix } },
      orderBy: { reference: 'desc' },
      select: { reference: true },
    });
    let next = 1;
    if (last) {
      const m = last.reference.match(/(\d+)$/);
      if (m) next = parseInt(m[1], 10) + 1;
    }
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  // ============================================================
  // Helpers calcul lignes + totaux
  // Les totaux sont stockes denormalises (Quote.subtotalHt/vatAmount/totalTtc)
  // pour eviter une jointure agregat a chaque liste/affichage.
  // ============================================================
  private async computeLines(lines: QuoteLineDto[]): Promise<ComputedLine[]> {
    // Resolution prix d'achat snapshot pour les lignes liees au catalogue
    const productIds = lines.map((l) => l.productId).filter((x): x is string => !!x);
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, purchasePriceHt: true },
        })
      : [];
    const purchaseMap = new Map(products.map((p) => [p.id, p.purchasePriceHt ? Number(p.purchasePriceHt) : null]));

    return lines.map((l, i) => {
      const discount = l.discountPct ?? 0;
      const raw = l.quantity * l.unitPriceHt;
      const lineTotal = +(raw * (1 - discount / 100)).toFixed(2);
      return {
        position: l.position ?? i,
        description: l.description,
        quantity: l.quantity,
        unitPriceHt: l.unitPriceHt,
        discountPct: discount,
        lineTotalHt: lineTotal,
        productId: l.productId ?? null,
        purchasePriceHtSnapshot: l.productId ? purchaseMap.get(l.productId) ?? null : null,
      };
    });
  }

  private computeTotals(lines: ComputedLine[], vatRate: number) {
    const subtotalHt = +lines.reduce((s, l) => s + l.lineTotalHt, 0).toFixed(2);
    const vatAmount = +(subtotalHt * (vatRate / 100)).toFixed(2);
    const totalTtc = +(subtotalHt + vatAmount).toFixed(2);
    return { subtotalHt, vatAmount, totalTtc };
  }

  // ============================================================
  // CRUD
  // ============================================================
  async findAll(params: {
    search?: string;
    status?: QuoteStatus;
    companyId?: string;
    ownerId?: string;
  }, tenantId: string | null) {
    const where: Prisma.QuoteWhereInput = { tenantId };
    if (params.status) where.status = params.status;
    if (params.companyId) where.companyId = params.companyId;
    if (params.ownerId) where.ownerId = params.ownerId;
    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' } },
        { reference: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.quote.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string, tenantId: string | null) {
    const q = await this.prisma.quote.findFirst({
      where: { id, tenantId },
      include: {
        company: true,
        contact: true,
        opportunity: { select: { id: true, title: true, stage: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
        convertedToContract: { select: { id: true, reference: true, status: true } },
        lines: { orderBy: { position: 'asc' } },
      },
    });
    if (!q) throw new NotFoundException('Devis introuvable');
    return q;
  }

  async create(dto: CreateQuoteDto, userId: string, tenantId: string | null) {
    const reference = await this.generateReference(tenantId);
    const computed = await this.computeLines(dto.lines);
    const vatRate = dto.vatRate ?? 20;
    const totals = this.computeTotals(computed, vatRate);

    const quote = await this.prisma.$transaction(async (tx) => {
      const created = await tx.quote.create({
        data: {
          reference,
          title: dto.title,
          status: 'DRAFT',
          validUntil: new Date(dto.validUntil),
          vatRate,
          notes: dto.notes,
          terms: dto.terms,
          subtotalHt: totals.subtotalHt,
          vatAmount: totals.vatAmount,
          totalTtc: totals.totalTtc,
          companyId: dto.companyId,
          contactId: dto.contactId,
          opportunityId: dto.opportunityId,
          ownerId: dto.ownerId ?? userId,
          tenantId: tenantId ?? undefined,
          lines: { create: computed.map((c) => ({ ...c, tenantId: tenantId ?? undefined })) },
        },
      });
      await tx.activity.create({
        data: { userId, tenantId, action: 'CREATE', entity: 'Quote', entityId: created.id },
      });
      return created;
    });
    return quote;
  }

  async update(id: string, dto: UpdateQuoteDto, userId: string, tenantId: string | null) {
    const existing = await this.findOne(id, tenantId);
    // Un devis SENT/ACCEPTED/REJECTED/EXPIRED ne peut plus etre modifie
    // (sauf retour a DRAFT explicite, hors scope MVP). Sinon on perdrait
    // la trace de ce qui a ete envoye au client.
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException(
        'Devis non modifiable (statut = ' + existing.status + '). Dupliquez-le pour creer une nouvelle version.',
      );
    }

    const data: Prisma.QuoteUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.validUntil !== undefined) data.validUntil = new Date(dto.validUntil);
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.terms !== undefined) data.terms = dto.terms;
    if (dto.contactId !== undefined) {
      data.contact = dto.contactId ? { connect: { id: dto.contactId } } : { disconnect: true };
    }
    if (dto.ownerId !== undefined) {
      data.owner = dto.ownerId ? { connect: { id: dto.ownerId } } : { disconnect: true };
    }

    let recomputed = false;
    let vatRate = Number(existing.vatRate);
    if (dto.vatRate !== undefined) {
      vatRate = dto.vatRate;
      data.vatRate = dto.vatRate;
      recomputed = true;
    }

    let computedLines: ComputedLine[] | null = null;
    if (dto.lines) {
      computedLines = await this.computeLines(dto.lines);
      recomputed = true;
    }

    if (recomputed) {
      const linesForTotal =
        computedLines ??
        existing.lines.map((l) => ({
          position: l.position,
          description: l.description,
          quantity: Number(l.quantity),
          unitPriceHt: Number(l.unitPriceHt),
          discountPct: Number(l.discountPct),
          lineTotalHt: Number(l.lineTotalHt),
        }));
      const t = this.computeTotals(linesForTotal, vatRate);
      data.subtotalHt = t.subtotalHt;
      data.vatAmount = t.vatAmount;
      data.totalTtc = t.totalTtc;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (computedLines) {
        await tx.quoteLine.deleteMany({ where: { quoteId: id } });
        await tx.quoteLine.createMany({
          data: computedLines.map((l) => ({ ...l, quoteId: id })),
        });
      }
      const u = await tx.quote.update({ where: { id }, data });
      await tx.activity.create({
        data: { userId, tenantId, action: 'UPDATE', entity: 'Quote', entityId: id },
      });
      return u;
    });

    return updated;
  }

  async remove(id: string, userId: string, tenantId: string | null) {
    const existing = await this.findOne(id, tenantId);
    if (existing.convertedToContractId) {
      throw new BadRequestException(
        'Devis converti en contrat — impossible de le supprimer. Detachez d\'abord le contrat.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.quote.delete({ where: { id } });
      await tx.activity.create({
        data: { userId, tenantId, action: 'DELETE', entity: 'Quote', entityId: id },
      });
    });
    return { ok: true };
  }

  // ============================================================
  // Workflow : send / accept / reject
  // ============================================================
  async send(id: string, userId: string, tenantId: string | null) {
    const q = await this.findOne(id, tenantId);
    if (q.status !== 'DRAFT') {
      throw new BadRequestException('Seul un devis DRAFT peut etre envoye (actuel : ' + q.status + ')');
    }
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.quote.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date() },
      });
      await tx.activity.create({
        data: { userId, tenantId, action: 'SEND', entity: 'Quote', entityId: id },
      });
      return u;
    });
  }

  async accept(id: string, userId: string, tenantId: string | null) {
    const q = await this.findOne(id, tenantId);
    if (q.status !== 'SENT') {
      throw new BadRequestException('Seul un devis SENT peut etre accepte (actuel : ' + q.status + ')');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.quote.update({
        where: { id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      await tx.activity.create({
        data: { userId, tenantId, action: 'ACCEPT', entity: 'Quote', entityId: id },
      });
      return u;
    });
    this.webhooks.emit('QUOTE_ACCEPTED', {
      id: updated.id, reference: updated.reference, totalTtc: Number(updated.totalTtc),
      companyId: updated.companyId,
    }, { companyId: updated.companyId, tenantId: updated.tenantId }).catch((err) => this.logger.warn('Webhook fail : ' + err.message));
    return updated;
  }

  async reject(id: string, reason: string | undefined, userId: string, tenantId: string | null) {
    const q = await this.findOne(id, tenantId);
    if (q.status !== 'SENT') {
      throw new BadRequestException('Seul un devis SENT peut etre refuse (actuel : ' + q.status + ')');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.quote.update({
        where: { id },
        data: { status: 'REJECTED', rejectedAt: new Date(), rejectionReason: reason },
      });
      await tx.activity.create({
        data: {
          userId,
          tenantId,
          action: 'REJECT',
          entity: 'Quote',
          entityId: id,
          metadata: reason ? { reason } : undefined,
        },
      });
      return u;
    });
    this.webhooks.emit('QUOTE_REJECTED', {
      id: updated.id, reference: updated.reference, reason: reason ?? null,
      companyId: updated.companyId,
    }, { companyId: updated.companyId, tenantId: updated.tenantId }).catch((err) => this.logger.warn('Webhook fail : ' + err.message));
    return updated;
  }

  // ============================================================
  // Conversion en Contract : reprend les valeurs commerciales du devis
  // (unitPriceHt + quantity = somme des lignes / nombre de lignes ramene a 1
  // utilisateur si applicable). Pour rester simple cote MVP : la quantite
  // est la somme des quantites des lignes, le prix unitaire est calcule
  // pour que monthlyAmountHt = totalDevis / engagementMonths (le devis
  // represente le total contractuel HT sur la duree d'engagement).
  // ============================================================
  async convertToContract(id: string, dto: ConvertQuoteDto, userId: string, tenantId: string | null) {
    const q = await this.findOne(id, tenantId);
    if (q.status !== 'ACCEPTED') {
      throw new BadRequestException('Seul un devis ACCEPTED peut etre converti (actuel : ' + q.status + ')');
    }
    if (q.convertedToContractId) {
      throw new BadRequestException('Devis deja converti (contrat ' + q.convertedToContractId + ')');
    }
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end <= start) throw new BadRequestException('endDate doit etre posterieure a startDate');

    const engagementMonths = dto.engagementMonths ?? 12;
    // Heuristique simple : quantite = somme des quantites des lignes,
    // unitPriceHt = totalHt / engagementMonths / quantite (montant mensuel
    // unitaire). Si le client veut autre chose, il editera le contrat apres.
    const quantity = Math.max(
      1,
      Math.round(q.lines.reduce((s, l) => s + Number(l.quantity), 0)),
    );
    const totalHt = Number(q.subtotalHt);
    const unitPriceHt = +(totalHt / engagementMonths / quantity).toFixed(2);
    const monthlyAmountHt = +(unitPriceHt * quantity).toFixed(2);

    // Reference contrat : on reutilise la convention existante MDO-YYYY-NNNN.
    // Scope la sequence par tenant : sinon en multi-instance DSI, le tenant A
    // et le tenant B partageraient le compteur (MDO-2026-0042 pourrait exister
    // chez les deux). Avec le filtre tenantId, chaque tenant a sa propre
    // sequence — la collision n'est plus possible.
    const year = start.getFullYear();
    const prefix = `MDO-${year}-`;
    const lastContract = await this.prisma.contract.findFirst({
      where: { tenantId, reference: { startsWith: prefix } },
      orderBy: { reference: 'desc' },
      select: { reference: true },
    });
    let nextNum = 1;
    if (lastContract) {
      const m = lastContract.reference.match(/(\d+)$/);
      if (m) nextNum = parseInt(m[1], 10) + 1;
    }
    const reference = `${prefix}${String(nextNum).padStart(4, '0')}`;

    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.create({
        data: {
          // Heriter du tenantId du quote, sinon le Contract serait global
          // (tenantId=null) et invisible aux requetes scope. q.tenantId vient
          // de findOne(id, tenantId) qui a deja scope par tenant.
          tenantId: q.tenantId,
          reference,
          title: q.title,
          offer: dto.offer,
          status: 'ACTIVE',
          startDate: start,
          endDate: end,
          signedAt: new Date(),
          engagementMonths,
          billingPeriod: 'MONTHLY',
          unitPriceHt,
          quantity,
          monthlyAmountHt,
          vatRate: q.vatRate,
          autoRenew: true,
          noticePeriodMonths: 3,
          companyId: q.companyId,
          opportunityId: q.opportunityId,
          ownerId: dto.ownerId ?? q.ownerId ?? userId,
          description: q.notes,
        },
      });
      await tx.quote.update({
        where: { id: q.id },
        data: { convertedToContractId: contract.id, convertedAt: new Date() },
      });
      await tx.activity.create({
        data: {
          userId,
          tenantId,
          action: 'CONVERT',
          entity: 'Quote',
          entityId: q.id,
          metadata: { contractId: contract.id, reference: contract.reference },
        },
      });
      return { quoteId: q.id, contract };
    });
  }

  // ============================================================
  // Cron : passe en EXPIRED tout devis SENT dont validUntil est passe.
  // Cadence 06:15 (avant les autres crons metier).
  // ============================================================
  @Cron('15 6 * * *', { name: 'quotes-expire', timeZone: 'Europe/Paris' })
  async expirePending() {
    const r = await this.prisma.quote.updateMany({
      where: { status: 'SENT', validUntil: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    if (r.count > 0) this.logger.log('Quotes expires : ' + r.count);
    return { expired: r.count };
  }

  // ============================================================
  // Stats commerciales (dashboard)
  // ============================================================
  async stats(tenantId: string | null) {
    const [drafts, sent, accepted, rejected, totalValueSent] = await Promise.all([
      this.prisma.quote.count({ where: { tenantId, status: 'DRAFT' } }),
      this.prisma.quote.count({ where: { tenantId, status: 'SENT' } }),
      this.prisma.quote.count({ where: { tenantId, status: 'ACCEPTED' } }),
      this.prisma.quote.count({ where: { tenantId, status: 'REJECTED' } }),
      this.prisma.quote.aggregate({
        where: { tenantId, status: 'SENT' },
        _sum: { totalTtc: true },
      }),
    ]);
    return {
      drafts,
      sent,
      accepted,
      rejected,
      pipelineValueTtc: Number(totalValueSent._sum.totalTtc ?? 0),
    };
  }
}
