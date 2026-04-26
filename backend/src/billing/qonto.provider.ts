import { Injectable, Logger } from '@nestjs/common';
import { BillingProviderKind, BankSource, BankTransactionSide } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  BillingProvider,
  PushClientInput,
  PushInvoiceInput,
  RemoteClient,
  RemoteInvoice,
} from './types';

// QontoProvider : aujourd'hui surtout utilise pour la lecture des transactions
// bancaires (rapprochement paiements). L'edition/emission de factures Qonto
// (Qonto Factures) est volontairement laissee en squelette : Mathieu utilise
// Sellsy aujourd'hui, on prevoit Qonto si bascule.

@Injectable()
export class QontoProvider implements BillingProvider {
  readonly kind = BillingProviderKind.QONTO;
  private readonly logger = new Logger(QontoProvider.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  async isConfigured(): Promise<boolean> {
    const slug = await this.settings.get('billing.qonto.organizationSlug');
    const key = await this.settings.get('billing.qonto.secretKey');
    return Boolean(slug && key);
  }

  private async authHeader(): Promise<string> {
    const slug = await this.settings.get('billing.qonto.organizationSlug');
    const key = await this.settings.get('billing.qonto.secretKey');
    if (!slug || !key) throw new Error('Qonto non configure');
    return slug + ':' + key;
  }

  private async base(): Promise<string> {
    return (await this.settings.get('billing.qonto.apiBase')) || 'https://thirdparty.qonto.com/v2';
  }

  private async request<T = any>(method: 'GET' | 'POST', path: string, body?: any): Promise<T> {
    const url = (await this.base()) + path;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: await this.authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Qonto ' + method + ' ' + path + ' -> ' + res.status + ' : ' + txt);
    }
    return (await res.json()) as T;
  }

  async ping(): Promise<{ ok: boolean; message: string }> {
    try {
      const slug = await this.settings.get('billing.qonto.organizationSlug');
      await this.request('GET', '/organizations/' + encodeURIComponent(slug ?? ''));
      return { ok: true, message: 'Connexion Qonto OK' };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  }

  // ---------- Facturation Qonto Factures (squelette) ----------
  async pushClient(_input: PushClientInput): Promise<RemoteClient> {
    throw new Error(
      'Qonto Factures : pushClient pas encore implemente. Utiliser Sellsy ou contribuer cette methode.',
    );
  }

  async pushInvoice(_input: PushInvoiceInput): Promise<RemoteInvoice> {
    throw new Error(
      'Qonto Factures : pushInvoice pas encore implemente. Utiliser Sellsy ou contribuer cette methode.',
    );
  }

  async pullInvoice(_externalId: string): Promise<RemoteInvoice | null> {
    return null;
  }

  // ---------- Lecture des transactions bancaires (cas d'usage principal) ----------
  // Synchronise les transactions Qonto (credit + debit) dans BankTransaction
  // pour rapprochement avec les factures clients.
  async syncTransactions(opts: { sinceDays?: number } = {}): Promise<{ imported: number }> {
    if (!(await this.isConfigured())) return { imported: 0 };
    const slug = (await this.settings.get('billing.qonto.organizationSlug')) ?? '';
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

      const data = await this.request<any>('GET', path).catch((err) => {
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
