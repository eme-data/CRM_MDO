import { Injectable, Logger } from '@nestjs/common';
import { BillingProviderKind, InvoiceStatus } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import {
  BillingProvider,
  PushClientInput,
  PushInvoiceInput,
  PushSubscriptionInput,
  RemoteClient,
  RemoteInvoice,
  RemoteSubscription,
} from './types';

// Cache token OAuth2 client_credentials Sellsy.
interface CachedToken {
  access_token: string;
  expiresAt: number; // epoch ms
}

// Mapping des statuts Sellsy vers nos InvoiceStatus.
// Sellsy utilise : draft / sent / paid / partially_paid / cancelled / late
function mapSellsyStatus(s: string | undefined | null): InvoiceStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'draft':
      return 'DRAFT';
    case 'paid':
    case 'partially_paid':
      return 'PAID';
    case 'late':
    case 'overdue':
      return 'OVERDUE';
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED';
    case 'sent':
    case 'issued':
    default:
      return 'ISSUED';
  }
}

@Injectable()
export class SellsyProvider implements BillingProvider {
  readonly kind = BillingProviderKind.SELLSY;
  private readonly logger = new Logger(SellsyProvider.name);
  private cachedToken: CachedToken | null = null;

  constructor(private readonly settings: SettingsService) {}

  async isConfigured(): Promise<boolean> {
    const id = await this.settings.get('billing.sellsy.clientId');
    const secret = await this.settings.get('billing.sellsy.clientSecret');
    return Boolean(id && secret);
  }

  // ---------- Auth OAuth2 client_credentials ----------
  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 30_000) {
      return this.cachedToken.access_token;
    }
    const clientId = await this.settings.get('billing.sellsy.clientId');
    const clientSecret = await this.settings.get('billing.sellsy.clientSecret');
    if (!clientId || !clientSecret) {
      throw new Error('Sellsy non configure (clientId / clientSecret manquants)');
    }
    const res = await fetch('https://login.sellsy.com/oauth2/access-tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Sellsy OAuth2 echoue (' + res.status + '): ' + txt);
    }
    const data: any = await res.json();
    this.cachedToken = {
      access_token: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    return data.access_token;
  }

  private async base(): Promise<string> {
    return (await this.settings.get('billing.sellsy.apiBase')) || 'https://api.sellsy.com/v2';
  }

  private async request<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: any,
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = (await this.base()) + path;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Sellsy ' + method + ' ' + path + ' -> ' + res.status + ' : ' + txt);
    }
    if (res.status === 204) return undefined as any;
    return (await res.json()) as T;
  }

  async ping(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.getAccessToken();
      // Endpoint leger qui valide juste le token
      await this.request('GET', '/companies?limit=1');
      return { ok: true, message: 'Connexion Sellsy OK' };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  }

  // ---------- Push client ----------
  async pushClient(input: PushClientInput): Promise<RemoteClient> {
    // Sellsy distingue companies (entreprises) et individuals (particuliers).
    // Cible principale MSP : companies.
    const payload: any = {
      type: 'corporation',
      name: input.name,
      reference: input.companyId,
      registration_number: input.siret ?? input.siren ?? undefined,
      vat_number: input.vatNumber ?? undefined,
      email: input.email ?? undefined,
      phone_number: input.phone ?? undefined,
      address: input.address
        ? {
            address_line_1: input.address,
            zipcode: input.postalCode ?? undefined,
            city: input.city ?? undefined,
            country: input.country ?? 'FR',
          }
        : undefined,
    };

    // Idempotence via reference (companyId du CRM).
    // Si Sellsy retourne 409/duplicate, on retombe sur la recherche.
    try {
      const res = await this.request<any>('POST', '/companies', payload);
      const id = String(res.id ?? res.data?.id);
      return {
        externalId: id,
        url: 'https://app.sellsy.com/companies/' + id,
      };
    } catch (err: any) {
      if (!String(err.message).includes('409')) throw err;
      // Recherche par reference
      const search = await this.request<any>(
        'GET',
        '/companies?filter[reference]=' + encodeURIComponent(input.companyId),
      );
      const item = search.data?.[0] ?? search.items?.[0];
      if (!item) throw err;
      return { externalId: String(item.id), url: 'https://app.sellsy.com/companies/' + item.id };
    }
  }

  // ---------- Push facture ----------
  async pushInvoice(input: PushInvoiceInput): Promise<RemoteInvoice> {
    const totalHt = input.lines.reduce((s, l) => s + l.quantity * l.unitPriceHt, 0);
    const totalTtc = totalHt * (1 + input.vatRate / 100);

    const rateId = await this.settings.get('billing.sellsy.defaultRate');

    const payload: any = {
      related: [{ type: 'company', id: Number(input.remoteClientId) }],
      date: input.issueDate.toISOString().substring(0, 10),
      due_date: input.dueDate.toISOString().substring(0, 10),
      currency: 'EUR',
      subject: input.contractRef ? 'Contrat ' + input.contractRef : undefined,
      note: input.notes,
      rows: input.lines.map((l, idx) => ({
        type: 'single',
        position: idx + 1,
        description: l.description,
        quantity: l.quantity,
        unit_amount: l.unitPriceHt,
        tax_id: rateId ? Number(rateId) : undefined,
      })),
    };

    const res = await this.request<any>('POST', '/invoices', payload);
    const id = String(res.id ?? res.data?.id);
    return {
      externalId: id,
      number: res.number ?? res.reference,
      status: 'DRAFT',
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      totalHt,
      totalTtc,
      vatRate: input.vatRate,
      url: 'https://app.sellsy.com/invoices/' + id,
      pdfUrl: undefined,
    };
  }

  // ---------- Push abonnement recurrent ----------
  async pushSubscription(input: PushSubscriptionInput): Promise<RemoteSubscription> {
    const period =
      input.billingPeriod === 'YEARLY'
        ? 'year'
        : input.billingPeriod === 'QUARTERLY'
          ? 'quarter'
          : 'month';

    const payload: any = {
      reference: input.reference,
      title: input.title,
      company_id: Number(input.remoteClientId),
      start_date: input.startDate.toISOString().substring(0, 10),
      end_date: input.endDate?.toISOString().substring(0, 10),
      period,
      lines: [
        {
          description: input.title,
          quantity: input.quantity,
          unit_amount: input.unitPriceHt,
          tax_rate: input.vatRate,
        },
      ],
    };
    const res = await this.request<any>('POST', '/subscriptions', payload);
    const id = String(res.id ?? res.data?.id);
    return { externalId: id, url: 'https://app.sellsy.com/subscriptions/' + id };
  }

  // ---------- Pull facture ----------
  async pullInvoice(externalId: string): Promise<RemoteInvoice | null> {
    try {
      const res = await this.request<any>('GET', '/invoices/' + encodeURIComponent(externalId));
      const inv = res.data ?? res;
      return {
        externalId: String(inv.id),
        number: inv.number ?? inv.reference,
        status: mapSellsyStatus(inv.status),
        issueDate: new Date(inv.date ?? inv.issued_at ?? Date.now()),
        dueDate: new Date(inv.due_date ?? inv.dueDate ?? Date.now()),
        paidAt: inv.paid_at ? new Date(inv.paid_at) : null,
        totalHt: Number(inv.amounts?.total_excluding_tax ?? inv.totalHt ?? 0),
        totalTtc: Number(inv.amounts?.total_including_tax ?? inv.totalTtc ?? 0),
        vatRate: Number(inv.amounts?.tax_rate ?? 20),
        url: 'https://app.sellsy.com/invoices/' + inv.id,
        pdfUrl: inv.pdf_link ?? undefined,
      };
    } catch (err: any) {
      this.logger.warn('Sellsy pullInvoice ' + externalId + ' : ' + err.message);
      return null;
    }
  }
}
