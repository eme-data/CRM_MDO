import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { SettingsService } from '../settings/settings.service';
import { QontoProvider } from './qonto.provider';
import { BillingProvider } from './types';

// Orchestrateur de facturation externe. Qonto Factures = unique PDP (Plateforme
// de Dematerialisation Partenaire) retenu apres retrait de Sellsy du stack MDO
// (2026-05). Les champs schema sellsyId / sellsySubscriptionId / enum SELLSY
// restent en base pour preserver l'integrite des donnees historiques mais ne
// sont plus utilises en ecriture.
//
// MULTI-TENANT : chaque tenant a son propre compte Qonto + ses propres
// settings billing.* — un push de contrat MDO va sur le compte Qonto MDO,
// un push Mairie de Seysses va sur le compte Qonto Seysses.

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly scope: TenantScope,
    private readonly qonto: QontoProvider,
  ) {}

  // ---------- Selection du provider ----------
  async getActiveProvider(tenantId: string | null = null): Promise<BillingProvider | null> {
    const choice = (await this.settings.get('billing.provider', tenantId)) ?? 'none';
    if (choice === 'qonto' && (await this.qonto.isConfigured(tenantId))) return this.qonto;
    return null;
  }

  async status(tenantId: string | null = null): Promise<{
    provider: string;
    configured: boolean;
    autoPushContracts: boolean;
    disableInternalCron: boolean;
    qontoConfigured: boolean;
    qontoSyncEnabled: boolean;
  }> {
    const choice = (await this.settings.get('billing.provider', tenantId)) ?? 'none';
    return {
      provider: choice,
      configured: Boolean(await this.getActiveProvider(tenantId)),
      autoPushContracts: await this.settings.getBool('billing.autoPushContracts', tenantId),
      disableInternalCron: await this.settings.getBool('billing.disableInternalCron', tenantId),
      qontoConfigured: await this.qonto.isConfigured(tenantId),
      qontoSyncEnabled: await this.settings.getBool('billing.qonto.syncEnabled', tenantId),
    };
  }

  // ---------- Push d'une societe vers le provider actif ----------
  async pushCompany(companyId: string, me: JwtUser): Promise<{ externalId: string; provider: string }> {
    await this.scope.assertCompanyInTenant(companyId, me);
    const provider = await this.getActiveProvider(me.tenantId);
    if (!provider) throw new Error('Aucun provider de facturation actif');

    const c = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!c) throw new NotFoundException('Societe introuvable');

    // Si deja synchronise vers Qonto, on n'ecrase rien
    if (c.qontoClientId) {
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
    }, me.tenantId);

    await this.prisma.company.update({
      where: { id: companyId },
      data: { qontoClientId: remote.externalId },
    });

    return { externalId: remote.externalId, provider: 'qonto' };
  }

  // ---------- Push d'un contrat (client + abonnement recurrent) ----------
  async pushContract(contractId: string, me: JwtUser): Promise<{
    qontoClientId?: string;
    subscriptionId?: string;
    provider: string;
  }> {
    const provider = await this.getActiveProvider(me.tenantId);
    if (!provider) throw new Error('Aucun provider de facturation actif');

    const contract = await this.prisma.contract.findFirst({
      where: this.scope.scopedWhere(me, { id: contractId }),
      include: { company: true },
    });
    if (!contract) throw new NotFoundException('Contrat introuvable');

    const clientPush = await this.pushCompany(contract.companyId, me);

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
        }, me.tenantId);
        subscriptionId = sub.externalId;
        await this.prisma.contract.update({
          where: { id: contractId },
          data: { externalSyncedAt: new Date() },
        });
      } catch (err: any) {
        this.logger.warn(
          'Push abonnement ' + contract.reference + ' echec : ' + err.message + ' (client OK)',
        );
      }
    }

    return {
      qontoClientId: clientPush.externalId,
      subscriptionId,
      provider: 'qonto',
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
  }, me: JwtUser) {
    const provider = await this.getActiveProvider(me.tenantId);
    if (!provider) throw new Error('Aucun provider de facturation actif');

    const client = await this.pushCompany(input.companyId, me);
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
    }, me.tenantId);

    // Cache local pour vue 360 sans rappeler l'API a chaque fois
    const cached = await this.prisma.invoice.create({
      data: {
        tenantId: me.tenantId,
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
            tenantId: me.tenantId,
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

  // ---------- Cron sync facture (fallback si webhook indisponible) ----------
  // Toutes les heures, on rafraichit les factures externes non payees.
  // Itere PAR TENANT : chacun a son propre provider (potentiellement aucun).
  @Cron('15 * * * *')
  async refreshExternalInvoices() {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    for (const t of tenants) {
      try {
        const provider = await this.getActiveProvider(t.id);
        if (!provider) continue;
        const open = await this.prisma.invoice.findMany({
          where: {
            tenantId: t.id,
            provider: provider.kind,
            externalId: { not: null },
            status: { in: [InvoiceStatus.DRAFT, InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE] },
          },
          take: 100,
          orderBy: { externalSyncedAt: 'asc' },
        });
        if (open.length === 0) continue;
        this.logger.log('Refresh ' + open.length + ' factures ' + provider.kind + ' [tenant ' + t.id + ']');
        for (const inv of open) {
          try {
            const fresh = await provider.pullInvoice(inv.externalId!, t.id);
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
      } catch (err: any) {
        this.logger.warn('refreshExternalInvoices tenant ' + t.id + ' echec : ' + err.message);
      }
    }
  }

  // ---------- Cron Qonto : import des transactions ----------
  // Itere PAR TENANT : chaque compte Qonto = 1 tenant.
  @Cron('0 * * * *')
  async syncQontoTransactions() {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    for (const t of tenants) {
      try {
        if (!(await this.settings.getBool('billing.qonto.syncEnabled', t.id))) continue;
        if (!(await this.qonto.isConfigured(t.id))) continue;
        const res = await this.qonto.syncTransactions(t.id, { sinceDays: 7 });
        if (res.imported > 0) {
          this.logger.log('Qonto [tenant ' + t.id + '] : ' + res.imported + ' nouvelles transactions');
          await this.reconcileBankTransactionsForTenant(t.id);
        }
      } catch (err: any) {
        this.logger.warn('syncQontoTransactions tenant ' + t.id + ' echec : ' + err.message);
      }
    }
  }

  // Rapprochement basique scope par tenant : pour chaque transaction CREDIT
  // non rapprochee, on cherche une societe DU MEME TENANT par nom ou siret.
  async reconcileBankTransactionsForTenant(tenantId: string) {
    const orphans = await this.prisma.bankTransaction.findMany({
      where: { tenantId, side: 'CREDIT', companyId: null },
      take: 200,
    });
    let matched = 0;
    for (const tx of orphans) {
      const needle = (tx.counterparty ?? tx.label ?? '').trim();
      if (needle.length < 4) continue;
      const candidates = await this.prisma.company.findMany({
        where: { tenantId, name: { contains: needle, mode: 'insensitive' } },
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
    if (matched > 0) this.logger.log('Rapprochement bancaire [tenant ' + tenantId + '] : ' + matched + ' tx affectees');
  }
}
