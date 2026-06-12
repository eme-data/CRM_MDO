// Branding : nom, logo, couleurs, contacts du deploiement courant.
// Recupere via GET /branding (endpoint public, pas d'auth requise).
//
// Strategie : fetch une fois au boot et cache dans localStorage. Eviter
// le flash "MDO Services" puis "Mairie de Seysses" quand le client refresh.
// Le cache est invalide si BRAND_NAME change (compare avec la version reseau
// quand le fetch reussit).

export interface Branding {
  name: string;
  shortName: string;
  tagline: string;
  supportEmail: string;
  dpoEmail: string;
  websiteUrl: string;
  logoUrl: string;
  primaryColor: string;
  footerText: string;
  instanceType: 'MDO' | 'CLIENT';
  isDemo?: boolean;
}

const STORAGE_KEY = 'crm_branding_v1';

// Defauts : utilises avant le 1er fetch + en SSR. Reflectent l'instance
// MDO historique pour ne pas casser l'UX existante si le fetch est lent.
export const DEFAULT_BRANDING: Branding = {
  name: 'MDO Services',
  shortName: 'MDO',
  tagline: 'Prestataire IT et Cybersecurite - Occitanie',
  supportEmail: 'support@mdoservices.fr',
  dpoEmail: 'dpo@mdoservices.fr',
  websiteUrl: 'https://www.mdoservices.fr',
  logoUrl: '/logo.svg',
  primaryColor: '#1d4ed8',
  footerText: 'MDO Services - Prestataire IT et Cybersecurite - Occitanie',
  instanceType: 'MDO',
};

export function getCachedBranding(): Branding {
  if (typeof window === 'undefined') return DEFAULT_BRANDING;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_BRANDING, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_BRANDING;
}

export async function fetchBranding(): Promise<Branding> {
  try {
    const res = await fetch('/api/branding');
    if (!res.ok) return getCachedBranding();
    const data = (await res.json()) as Branding;
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
    return data;
  } catch {
    return getCachedBranding();
  }
}
