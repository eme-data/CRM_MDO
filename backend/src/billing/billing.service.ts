import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BillingProviderKind, InvoiceStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SellsyProvider } from './sellsy.provider';
import { QontoProvider } from './qonto.provider';
import { BillingProvider } from './types';

// Orchestrateur : choisit le provider actif a partir des settings,
// expose les methodes haut niveau (sync contrat/client) et gere les
// callbacks webhook + crons.

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly sellsy: SellsyProvider,
    private readonly qonto: QontoProvider,
  ) {}

  // ---------- Selection du provider ----------
  async getActiveProvider(): Promise<BillingProvider | null> {
    const choice = (await this.settings.get('billing.provider')) ?? 'none';
    if (choice === 'sellsy' && (await this.sellsy.isConfigured())) return this.sellsy;
    if (choice === 'qonto' && (await this.qonto.isConfigured())) return this.qonto;
    return null;
  }

  async status(): Promise<{
    provider: string;
    configured: boolean;
    autoPushContracts: boolean;
    disableInternalCron: boolean;
    sellsyConfigured: boolean;
    qontoConfigured: boolean;
    qontoSyncEnabled: boolean;
  }> {
    const choice = (await this.settings.get('billing.provider')) ?? 'none';
    return {
      provider: choice,
      configured: Boolean(await this.getActiveProvider()),
      autoPushContracts: await this.settings.getBool('billing.autoPushContracts'),
      disableInternalCron: await this.settings.getBool('billing.disableInternalCron'),
      sellsyConfigured: await this.sellsy.isConfigured(),
      qontoConfigured: await this.qonto.isConfigured(),
      qontoSyncEnabled: await this.settings.getBool('billing.qonto.syncEnabled'),
    };
  }

  // ---------- Push d'une societe vers le provider actif ----------
  async pushCompany(companyId: string): Promise<{ externalId: string; provider: string }> {
    const provider = await this.getActiveProvider();
    if (!provider) throw new Error('Aucun provider de facturation actif');

    const c = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!c) throw new NotFoundException('Societe introuvable');

    // Si deja synchronise vers ce provider, on n'ecrase rien
    if (provider.kind === 'SELLSY' && c.sellsyId) {
      return { externalId: c.sellsyId, provider: 'sellsy' };
    }
    if (provider.kind === 'QONTO' && c.qontoClientId) {
      return { externalId: c.qontoClientId, provider: 'qonto' };
    }

    const remote = await provider.pushClient({
      companyId: c.id,
      name: c.name,
      siret: c.siret,
      siren: c.siren,
      email: c.email,
      phone: c.phone,
      address: c.address,
      postalCode: c.postalCode,
      city: c.city,
      country: c.country,
    });

    const data: any = {};
    if (provider.kind === 'SELLSY') data.sellsyId = remote.externalId;
    if (provider.kind === 'QONTO') data.qontoClientId = remote.externalId;
    await this.prisma.company.update({ where: { id: companyId }, data });

    return { externalId: remote.externalId, provider: provider.kind.toLowerCase() };
  }

  // ---------- Push d'un contrat (client + abonnement recurrent) ----------
  async pushContract(contractId: string): Promise<{
    sellsyClientId?: string;
    sellsySubscriptionId?: string;
    provider: string;
  }> {
    const provider = await this.getActiveProvider();
    if (!provider) throw new Error('Aucun provider de facturation actif');

    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { company: true },
    });
    if (!contract) throw new NotFoundException('Contrat introuvable');

    const clientPush = await this.pushCompany(contract.companyId);

    let subscriptionId: string | undefined;
    if (provider.pushSubscription) {
      try {
        const sub = await provider.pushSubscription({
          contractId: contract.id,
          reference: contract.reference,
          title: contract.title,
          remoteClientId: clientPush.externalId,
          unitPriceHt: Number(contract.unitPriceHt),
          quantity: contract.quantity,
          vatRate: Number(contract.vatRate),
          startDate: contract.startDate,
          endDate: contract.endDate,
          billingPeriod: contract.billingPeriod,
        });
        subscriptionId = sub.externalId;
        await this.prisma.contract.update({
          where: { id: contractId },
          data: {
            sellsySubscriptionId: provider.kind === 'SELLSY' ? sub.externalId : undefined,
            externalSyncedAt: new Date(),
          },
        });
      } catch (err: any) {
        this.logger.warn(
          'Push abonnement ' + contract.reference + ' echec : ' + err.message + ' (client OK)',
        );
      }
    }

    return {
      sellsyClientId: provider.kind === 'SELLSY' ? clientPush.externalId : undefined,
      sellsySubscriptionId: subscriptionId,
      provider: provider.kind.toLowerCase(),
    };
  }

  // ---------- Push manuel d'une facture (cas devis ponctuel) ----------
  async pushInvoiceNow(input: {
    companyId: string;
    contractId?: string;
    issueDate?: Date;
    dueDate?: Date;
    vatRate?: number;
    notes?: string;
    lines: Array<{ description: string; quantity: number; unitPriceHt: number }>;
  }) {
    const provider = await this.getActiveProvider();
    if (!provider) throw new Error('Aucun provider de facturation actif');

    const client = await this.pushCompany(input.companyId);
    const issueDate = input.issueDate ?? new Date();
    const dueDate = input.dueDate ?? new Date(issueDate.getTime() + 30 * 86400_000);
    const vatRate = input.vatRate ?? 20;
    const totalHt = input.lines.reduce((s, l) => s + l.quantity * l.unitPriceHt, 0);
    const totalTtc = totalHt * (1 + vatRate / 100);

    const remote = await provider.pushInvoice({
      remoteClientId: client.externalId,
      contractRef: input.contractId,
      issueDate,
      dueDate,
      vatRate,
      notes: input.notes,
      lines: input.lines,
    });

    // Cache local pour vue 360 sans rappeler l'API a chaque fois
    const cached = await this.prisma.invoice.create({
      data: {
        number: remote.number ?? 'EXT-' + remote.externalId,
        status: remote.status,
        issueDate,
        dueDate,
        vatRate,
        totalHt,
        totalTtc,
        notes: input.notes,
        companyId: input.companyId,
        contractId: input.contractId,
        provider: provider.kind,
        externalId: remote.externalId,
        externalUrl: remote.url,
        externalPdfUrl: remote.pdfUrl,
        externalSyncedAt: new Date(),
        lines: {
          create: input.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPriceHt: l.unitPriceHt,
            totalHt: l.quantity * l.unitPriceHt,
          })),
        },
      },
      include: { lines: true },
    });
    return cached;
  }

  // ---------- Webhook Sellsy ----------
  // Verifie la signature HMAC et applique l'evenement (mise a jour statut facture).
  verifySellsySignature(rawBody: string, signature: string | undefined, secret: string): boolean {
    if (!signature || !secret) return false;
    const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  async handleSellsyEvent(event: any): Promise<{ ok: boolean; updated?: string }> {
    // Format attendu (a aligner avec la doc Sellsy actuelle) :
    // { event: 'invoice.paid', resource: { id: '12345', status: 'paid', ... } }
    const type: string = event?.event ?? event?.type ?? '';
    const resource = event?.resource ?? event?.data ?? {};
    if (!type.startsWith('invoice.')) return { ok: true };

    const externalId = String(resource.id ?? '');
    if (!externalId) return { ok: true };

    const inv = await this.prisma.invoice.findFirst({
      where: { provider: BillingProviderKind.SELLSY, externalId },
    });
    if (!inv) return { ok: true }; // facture pas (encore) cachee localement

    // Pull frais pour avoir l'etat reel (les payloads webhook sont parfois minimes)
    const fresh = await this.sellsy.pullInvoice(externalId);
    if (!fresh) return { ok: true };

    await this.prisma.invoice.update({
      where: { id: inv.id },
      data: {
        status: fresh.status,
        paidAt: fresh.status === 'PAID' ? (fresh.paidAt ?? new Date()) : null,
        externalUrl: fresh.url ?? inv.externalUrl,
        externalPdfUrl: fresh.pdfUrl ?? inv.externalPdfUrl,
        externalSyncedAt: new Date(),
      },
    });
    return { ok: true, updated: inv.id };
  }

  // ---------- Cron sync facture (fallback si webhook indisponible) ----------
  // Toutes les heures, on rafraichit les factures externes non payees.
  @Cron('15 * * * *')
  async refreshExternalInvoices() {
    const provider = await this.getActiveProvider();
    if (!provider) return;
    const open = await this.prisma.invoice.findMany({
      where: {
        provider: provider.kind,
        externalId: { not: null },
        status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
      },
      take: 100,
      orderBy: { externalSyncedAt: 'asc' },
    });
    if (open.length === 0) return;
    this.logger.log('Refresh ' + open.length + ' factures ' + provider.kind);
    for (const inv of open) {
      try {
        const fresh = await provider.pullInvoice(inv.externalId!);
        if (!fresh) continue;
        await this.prisma.invoice.update({
          where: { id: inv.id },
          data: {
            status: fresh.status,
            paidAt: fresh.status === 'PAID' ? (fresh.paidAt ?? new Date()) : inv.paidAt,
            externalUrl: fresh.url ?? inv.externalUrl,
            externalPdfUrl: fresh.pdfUrl ?? inv.externalPdfUrl,
            externalSyncedAt: new Date(),
          },
        });
      } catch (err: any) {
        this.logger.warn('Refresh facture ' + inv.id + ' echec : ' + err.message);
      }
    }
  }

  // ---------- Cron Qonto : import des transactions ----------
  @Cron('0 * * * *')
  async syncQontoTransactions() {
    if (!(await this.settings.getBool('billing.qonto.syncEnabled'))) return;
    if (!(await this.qonto.isConfigured())) return;
    const res = await this.qonto.syncTransactions({ sinceDays: 7 });
    if (res.imported > 0) {
      this.logger.log('Qonto : ' + res.imported + ' nouvelles transactions importees');
      await this.reconcileBankTransactions();
    }
  }

  // Rapprochement basique : pour chaque transaction CREDIT non rapprochee,
  // on cherche une societe par nom contrepartie ou par siret/siren.
  // Premiere passe : matching par nom. Sera affinee avec le siret plus tard.
  async reconcileBankTransactions() {
    const orphans = await this.prisma.bankTransaction.findMany({
      where: { side: 'CREDIT', companyId: null },
      take: 200,
    });
    let matched = 0;
    for (const tx of orphans) {
      const needle = (tx.counterparty ?? tx.label ?? '').trim();
      if (needle.length < 4) continue;
      const candidates = await this.prisma.company.findMany({
        where: { name: { contains: needle, mode: 'insensitive' } },
        take: 2,
      });
      if (candidates.length === 1) {
        await this.prisma.bankTransaction.update({
          where: { id: tx.id },
          data: { companyId: candidates[0].id },
        });
        matched++;
      }
    }
    if (matched > 0) this.logger.log('Rapprochement bancaire : ' + matched + ' tx affectees');
  }
}
