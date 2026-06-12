import { Injectable, Logger } from '@nestjs/common';
import { BillingProviderKind, InvoiceStatus } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import { assertSafePublicUrl } from '../common/http/safe-fetch';
import {
  BillingProvider,
  PushClientInput,
  PushInvoiceInput,
  RemoteClient,
  RemoteInvoice,
} from './types';

// PennylaneProvider : connecteur facturation/compta Pennylane (API v2).
//   - Base : https://app.pennylane.com/api/external/v2
//   - Auth : Bearer <token> (genere dans Pennylane > Parametres > Developpeurs,
//     scopes customer_invoices:all + customers).
//   - Cree les clients (POST /company_customers) et les factures
//     (POST /customer_invoices), et relit le statut (GET /customer_invoices/{id}).
//   - Pas de notion d'abonnement recurrent ici -> pushSubscription non implemente
//     (les contrats poussent un client ; la facture recurrente reste a generer
//     manuellement ou cote Pennylane).
//
// MULTI-TENANT : token resolu par tenant via Settings (billing.pennylane.apiToken).

@Injectable()
export class PennylaneProvider implements BillingProvider {
  readonly kind = BillingProviderKind.PENNYLANE;
  private readonly logger = new Logger(PennylaneProvider.name);

  constructor(private readonly settings: SettingsService) {}

  async isConfigured(tenantId: string | null = null): Promise<boolean> {
    return Boolean(await this.settings.get('billing.pennylane.apiToken', tenantId));
  }

  private async base(tenantId: string | null): Promise<string> {
    return (
      (await this.settings.get('billing.pennylane.apiBase', tenantId)) ||
      'https://app.pennylane.com/api/external/v2'
    );
  }

  private async request<T = any>(
    method: 'GET' | 'POST',
    path: string,
    tenantId: string | null,
    body?: any,
  ): Promise<T> {
    const token = await this.settings.get('billing.pennylane.apiToken', tenantId);
    if (!token) throw new Error('Pennylane non configure (billing.pennylane.apiToken)');
    const baseUrl = await this.base(tenantId);
    // Anti-SSRF : si apiBase est surcharge vers une IP privee/localhost, on
    // bloque avant de fuiter le token + les donnees client.
    await assertSafePublicUrl(baseUrl);
    const res = await fetch(baseUrl + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      // Sans timeout, un Pennylane lent bloque le worker indefiniment.
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error('Pennylane ' + method + ' ' + path + ' -> ' + res.status + ' : ' + txt.slice(0, 400));
    }
    return (await res.json()) as T;
  }

  async ping(tenantId: string | null = null): Promise<{ ok: boolean; message: string }> {
    try {
      await this.request('GET', '/customer_invoices?limit=1', tenantId);
      return { ok: true, message: 'Connexion Pennylane OK' };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  }

  // ---------- Client ----------
  async pushClient(input: PushClientInput, tenantId: string | null = null): Promise<RemoteClient> {
    const payload: any = {
      name: input.name,
      external_reference: input.companyId,
    };
    if (input.email) payload.emails = [input.email];
    // reg_no Pennylane = SIREN (9 chiffres) ; sinon on derive du SIRET.
    const regNo = input.siren ?? (input.siret ? input.siret.replace(/\s/g, '').slice(0, 9) : null);
    if (regNo) payload.reg_no = regNo;
    if (input.vatNumber) payload.vat_number = input.vatNumber;
    if (input.address || input.postalCode || input.city) {
      payload.billing_address = {
        address: input.address ?? '',
        postal_code: input.postalCode ?? '',
        city: input.city ?? '',
        country: this.countryCode(input.country),
      };
    }

    const data = await this.request<any>('POST', '/company_customers', tenantId, payload);
    const id = data?.id ?? data?.customer?.id ?? data?.company_customer?.id;
    if (id == null) throw new Error('Pennylane : reponse creation client sans id');
    return { externalId: String(id) };
  }

  // ---------- Facture ----------
  async pushInvoice(input: PushInvoiceInput, tenantId: string | null = null): Promise<RemoteInvoice> {
    const customerId = Number(input.remoteClientId);
    if (Number.isNaN(customerId)) throw new Error('Pennylane : remoteClientId invalide (' + input.remoteClientId + ')');

    const payload: any = {
      customer_id: customerId,
      date: this.ymd(input.issueDate),
      deadline: this.ymd(input.dueDate),
      // Cree en brouillon : l'operateur revoit/finalise dans Pennylane (acte
      // comptable). Eviter de finaliser automatiquement une facture legale.
      draft: true,
      invoice_lines: input.lines.map((l) => ({
        label: l.description,
        quantity: l.quantity,
        unit: 'piece',
        raw_currency_unit_price: String(l.unitPriceHt),
        vat_rate: this.vatRate(input.vatRate),
      })),
    };
    if (input.contractRef) payload.external_reference = input.contractRef;

    const data = await this.request<any>('POST', '/customer_invoices', tenantId, payload);
    return this.mapInvoice(data, input.vatRate, input.issueDate, input.dueDate);
  }

  async pullInvoice(externalId: string, tenantId: string | null = null): Promise<RemoteInvoice | null> {
    try {
      const data = await this.request<any>('GET', '/customer_invoices/' + encodeURIComponent(externalId), tenantId);
      return this.mapInvoice(data);
    } catch (err: any) {
      this.logger.warn('Pennylane pullInvoice ' + externalId + ' echec : ' + err.message);
      return null;
    }
  }

  // ---------- Helpers ----------
  private mapInvoice(
    data: any,
    fallbackVat = 20,
    fallbackIssue?: Date,
    fallbackDue?: Date,
  ): RemoteInvoice {
    const totalHt = Number(data?.currency_amount_before_tax ?? data?.amount_before_tax ?? 0);
    const totalTtc = Number(data?.currency_amount ?? data?.amount ?? totalHt);
    return {
      externalId: String(data?.id ?? ''),
      number: data?.invoice_number ?? undefined,
      status: this.mapStatus(data),
      issueDate: data?.date ? new Date(data.date) : (fallbackIssue ?? new Date()),
      dueDate: data?.deadline ? new Date(data.deadline) : (fallbackDue ?? new Date()),
      paidAt: data?.paid_at ? new Date(data.paid_at) : null,
      totalHt,
      totalTtc,
      vatRate: fallbackVat,
      url: data?.public_url ?? data?.invoice_url ?? undefined,
      pdfUrl: data?.file_url ?? data?.pdf_url ?? data?.invoice_file_url ?? undefined,
    };
  }

  // Pennylane : status "draft" | "finalized" (+ paiement). On derive l'etat CRM.
  private mapStatus(data: any): InvoiceStatus {
    const status = String(data?.status ?? '').toLowerCase();
    if (status === 'draft' || status === '') return InvoiceStatus.DRAFT;
    // Finalisee : payee ? (paid bool, ou reste a payer = 0)
    const remaining = Number(data?.remaining_amount_with_tax ?? data?.remaining_amount ?? NaN);
    const paid = data?.paid === true || data?.payment_status === 'paid' || remaining === 0;
    if (paid) return InvoiceStatus.PAID;
    // En retard ?
    const deadline = data?.deadline ? new Date(data.deadline) : null;
    if (deadline && deadline.getTime() < Date.now()) return InvoiceStatus.OVERDUE;
    return InvoiceStatus.ISSUED;
  }

  private ymd(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  // TVA -> code Pennylane (FR).
  private vatRate(rate: number): string {
    const r = Math.round(rate * 10) / 10;
    if (r === 20) return 'FR_200';
    if (r === 10) return 'FR_100';
    if (r === 5.5) return 'FR_055';
    if (r === 2.1) return 'FR_021';
    if (r === 0) return 'exempt';
    return 'FR_200';
  }

  private countryCode(country?: string | null): string {
    if (!country) return 'FR';
    const c = country.trim();
    if (/^[A-Za-z]{2}$/.test(c)) return c.toUpperCase();
    if (/france/i.test(c)) return 'FR';
    return 'FR';
  }
}
