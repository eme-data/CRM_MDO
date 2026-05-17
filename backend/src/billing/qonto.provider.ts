import { Injectable, Logger } from '@nestjs/common';
import { BillingProviderKind, BankSource, BankTransactionSide } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { assertSafePublicUrl } from '../common/http/safe-fetch';
import {
  BillingProvider,
  PushClientInput,
  PushInvoiceInput,
  RemoteClient,
  RemoteInvoice,
} from './types';

// QontoProvider : aujourd'hui surtout utilise pour la lecture des transactions
// bancaires (rapprochement paiements). L'edition/emission de factures Qonto
// (Qonto Factures) est volontairement laissee en squelette — a implementer
// quand Mathieu bascule la facturation cote Qonto.
//
// MULTI-TENANT : chaque tenant a son PROPRE compte Qonto (slug + cle). Toutes
// les methodes prennent tenantId et resolvent les credentials via Settings.
// Sans ca, MDO et Mairie de Seysses tireraient sur le meme compte Qonto.

@Injectable()
export class QontoProvider implements BillingProvider {
  readonly kind = BillingProviderKind.QONTO;
  private readonly logger = new Logger(QontoProvider.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  async isConfigured(tenantId: string | null = null): Promise<boolean> {
    const slug = await this.settings.get('billing.qonto.organizationSlug', tenantId);
    const key = await this.settings.get('billing.qonto.secretKey', tenantId);
    return Boolean(slug && key);
  }

  private async authHeader(tenantId: string | null): Promise<string> {
    const slug = await this.settings.get('billing.qonto.organizationSlug', tenantId);
    const key = await this.settings.get('billing.qonto.secretKey', tenantId);
    if (!slug || !key) throw new Error('Qonto non configure');
    return slug + ':' + key;
  }

  private async base(tenantId: string | null): Promise<string> {
    return (await this.settings.get('billing.qonto.apiBase', tenantId)) || 'https://thirdparty.qonto.com/v2';
  }

  private async request<T = any>(method: 'GET' | 'POST', path: string, tenantId: string | null, body?: any): Promise<T> {
    const baseUrl = await this.base(tenantId);
    // Anti-SSRF : si un tenant configure billing.qonto.apiBase pointant vers
    // une IP privee/localhost (par erreur ou attaque), on bloque avant l'appel.
    // Sinon, la cle Qonto et le payload (contenant des donnees client) fuit
    // vers un service interne arbitraire. assertSafePublicUrl recheck aussi
    // DNS rebinding.
    await assertSafePublicUrl(baseUrl);
    const url = baseUrl + path;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: await this.authHeader(tenantId),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      // Sans timeout, un Qonto lent (incident) bloque le worker BullMQ
      // indefiniment et cascade vers le cron syncTransactions horaire.
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Qonto ' + method + ' ' + path + ' -> ' + res.status + ' : ' + txt);
    }
    return (await res.json()) as T;
  }

  async ping(tenantId: string | null = null): Promise<{ ok: boolean; message: string }> {
    try {
      const slug = await this.settings.get('billing.qonto.organizationSlug', tenantId);
      await this.request('GET', '/organizations/' + encodeURIComponent(slug ?? ''), tenantId);
      return { ok: true, message: 'Connexion Qonto OK' };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  }

  // ---------- Facturation Qonto Factures (squelette) ----------
  async pushClient(_input: PushClientInput, _tenantId: string | null = null): Promise<RemoteClient> {
    throw new Error(
      'Qonto Factures : pushClient pas encore implemente. A coder quand on basculera la facturation cote Qonto.',
    );
  }

  async pushInvoice(_input: PushInvoiceInput, _tenantId: string | null = null): Promise<RemoteInvoice> {
    throw new Error(
      'Qonto Factures : pushInvoice pas encore implemente. A coder quand on basculera la facturation cote Qonto.',
    );
  }

  async pullInvoice(_externalId: string, _tenantId: string | null = null): Promise<RemoteInvoice | null> {
    return null;
  }

  // ---------- Lecture des transactions bancaires (cas d'usage principal) ----------
  // Synchronise les transactions Qonto (credit + debit) dans BankTransaction
  // pour rapprochement avec les factures clients.
  // tenantId OBLIGATOIRE : sans, on tire sur le compte Qonto MDO.
  async syncTransactions(tenantId: string | null, opts: { sinceDays?: number } = {}): Promise<{ imported: number }> {
    if (!(await this.isConfigured(tenantId))) return { imported: 0 };
    const slug = (await this.settings.get('billing.qonto.organizationSlug', tenantId)) ?? '';
    const since = new Date();
    since.setDate(since.getDate() - (opts.sinceDays ?? 30));

    let imported = 0;
    let page = 1;
    const perPage = 100;
    // Pagination Qonto : ?current_page=&per_page=
    // Filtre date : settled_at_from
    // (compatible avec API thirdparty v2 - ajuster si Qonto evolue)
    while (true) {
      const path =
        '/transactions?slug=' +
        encodeURIComponent(slug) +
        '&current_page=' +
        page +
        '&per_page=' +
        perPage +
        '&settled_at_from=' +
        encodeURIComponent(since.toISOString());

      const data = await this.request<any>('GET', path, tenantId).catch((err) => {
        this.logger.warn('Qonto syncTransactions page ' + page + ' echec : ' + err.message);
        return null;
      });
      if (!data) break;

      const items: any[] = data.transactions ?? [];
      for (const t of items) {
        const externalId = String(t.transaction_id ?? t.id);
        const exists = await this.prisma.bankTransaction.findUnique({ where: { externalId } });
        if (exists) continue;

        await this.prisma.bankTransaction.create({
          data: {
            tenantId,
            source: BankSource.QONTO,
            externalId,
            bookedAt: new Date(t.settled_at ?? t.emitted_at ?? Date.now()),
            side: t.side === 'credit' ? BankTransactionSide.CREDIT : BankTransactionSide.DEBIT,
            amount: Math.abs(Number(t.amount ?? 0)),
            currency: t.currency ?? 'EUR',
            label: (t.label ?? t.clean_counterparty_name ?? '').toString().slice(0, 250),
            rawLabel: (t.reference ?? t.note ?? null)?.toString().slice(0, 500),
            counterparty: (t.clean_counterparty_name ?? t.counterparty_name ?? null)
              ?.toString()
              .slice(0, 250),
            reference: (t.reference ?? null)?.toString().slice(0, 250),
            status: t.status ?? null,
          },
        });
        imported++;
      }

      const totalPages = data.meta?.total_pages ?? page;
      if (page >= totalPages || items.length < perPage) break;
      page++;
    }
    return { imported };
  }
}
