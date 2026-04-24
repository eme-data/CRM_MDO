import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatEuro(amount: number | string | null | undefined): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount ?? 0;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '-';
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return '-';
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function daysBetween(from: Date | string, to: Date | string) {
  const f = typeof from === 'string' ? new Date(from) : from;
  const t = typeof to === 'string' ? new Date(to) : to;
  return Math.round((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24));
}

export function daysUntil(date: Date | string) {
  return daysBetween(new Date(), date);
}

export const contractOfferLabel: Record<string, string> = {
  MDO_ESSENTIEL: 'MDO Essentiel',
  MDO_PRO: 'MDO Pro',
  MDO_SOUVERAIN: 'MDO Souverain',
  CUSTOM: 'Sur mesure',
};

export const contractStatusLabel: Record<string, string> = {
  DRAFT: 'Brouillon',
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
  EXPIRED: 'Expire',
  TERMINATED: 'Resilie',
  RENEWED: 'Renouvele',
};

export const contractStatusColor: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  SUSPENDED: 'bg-amber-100 text-amber-700',
  EXPIRED: 'bg-red-100 text-red-700',
  TERMINATED: 'bg-slate-100 text-slate-700',
  RENEWED: 'bg-blue-100 text-blue-700',
};

export const sectorLabel: Record<string, string> = {
  PME: 'PME',
  TPE: 'TPE',
  COLLECTIVITE: 'Collectivite',
  SANTE: 'Sante',
  INDUSTRIE: 'Industrie',
  EDUCATION: 'Education',
  ASSOCIATION: 'Association',
  AUTRE: 'Autre',
};

export const companyStatusLabel: Record<string, string> = {
  LEAD: 'Lead',
  PROSPECT: 'Prospect',
  CUSTOMER: 'Client',
  INACTIVE: 'Inactif',
};

export const stageLabel: Record<string, string> = {
  QUALIFICATION: 'Qualification',
  PROPOSITION: 'Proposition',
  NEGOCIATION: 'Negociation',
  GAGNE: 'Gagne',
  PERDU: 'Perdu',
};
