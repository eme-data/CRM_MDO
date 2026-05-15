'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Branding, DEFAULT_BRANDING, fetchBranding, getCachedBranding } from '@/lib/branding';

// Context React pour le branding. Fournit le theme/nom courant a tout
// composant via useBranding(). Premier render utilise le cache localStorage
// (pas de flash), puis un fetch en background remplace si change.

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  useEffect(() => {
    // Hydrate depuis le cache pour le 1er render apres mount
    setBranding(getCachedBranding());
    // Puis fetch reseau en background pour rafraichir si server change
    fetchBranding().then(setBranding).catch(() => {});
  }, []);

  return (
    <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>
  );
}

export function useBranding(): Branding {
  return useContext(BrandingContext);
}
