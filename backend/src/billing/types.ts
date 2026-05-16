// Types communs pour les providers de facturation externe.
//
// Provider actif unique : Qonto Factures (PDP conforme facturation
// electronique 2026-2027). L'interface BillingProvider reste generique
// pour permettre l'ajout d'un autre PDP a l'avenir sans refactor majeur.
//
// Le CRM ne genere plus les factures lui-meme quand un provider externe
// est configure : il pousse les contrats / clients vers l'outil tiers
// (source de verite pour la facturation electronique PDP), et recoit en
// retour les statuts via webhook ou pull periodique.

import { BillingProviderKind, InvoiceStatus } from '@prisma/client';

export interface RemoteClient {
  externalId: string;
  url?: string;
}

export interface RemoteInvoice {
  externalId: string;
  number?: string;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  paidAt?: Date | null;
  totalHt: number;
  totalTtc: number;
  vatRate: number;
  url?: string;
  pdfUrl?: string;
}

export interface RemoteSubscription {
  externalId: string;
  url?: string;
}

export interface PushClientInput {
  companyId: string;
  name: string;
  siret?: string | null;
  siren?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  vatNumber?: string | null;
}

export interface PushSubscriptionInput {
  contractId: string;
  reference: string;
  title: string;
  remoteClientId: string;
  unitPriceHt: number;
  quantity: number;
  vatRate: number;
  startDate: Date;
  endDate?: Date;
  // monthly / quarterly / yearly
  billingPeriod: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
}

export interface PushInvoiceInput {
  remoteClientId: string;
  contractRef?: string;
  issueDate: Date;
  dueDate: Date;
  vatRate: number;
  notes?: string;
  lines: Array<{
    description: string;
    quantity: number;
    unitPriceHt: number;
  }>;
}

// Interface qu'un provider doit implementer pour etre branche dans le CRM.
// Les methodes peuvent renvoyer null si l'operation n'est pas supportee
// par ce provider (ex : Qonto Factures n'a pas la notion d'abonnement).
//
// MULTI-TENANT : toutes les methodes acceptent tenantId optionnel. Si null
// (cron systeme legacy / single-tenant MDO), on tombe sur la config globale.
// Sinon, credentials et endpoints sont resolus pour ce tenant precis.
export interface BillingProvider {
  readonly kind: BillingProviderKind;

  isConfigured(tenantId?: string | null): Promise<boolean>;

  // Test de connectivite (verifie credentials)
  ping(tenantId?: string | null): Promise<{ ok: boolean; message: string }>;

  pushClient(input: PushClientInput, tenantId?: string | null): Promise<RemoteClient>;
  pushInvoice(input: PushInvoiceInput, tenantId?: string | null): Promise<RemoteInvoice>;
  pushSubscription?(input: PushSubscriptionInput, tenantId?: string | null): Promise<RemoteSubscription>;

  // Pull de l'etat d'une facture deja creee cote provider
  pullInvoice(externalId: string, tenantId?: string | null): Promise<RemoteInvoice | null>;
}
