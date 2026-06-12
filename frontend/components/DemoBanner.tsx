'use client';
import { Sparkles, ShieldAlert } from 'lucide-react';
import { useBranding } from '@/components/BrandingProvider';

// Bandeau affiche uniquement sur un tenant de demonstration (branding.isDemo).
// Rappelle que les donnees sont fictives + reinitialisees, et que le MFA y est
// optionnel alors qu'il est obligatoire en production.
export function DemoBanner() {
  const branding = useBranding();
  if (!branding.isDemo) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900">
      <span className="inline-flex items-center gap-1 font-semibold">
        <Sparkles size={14} /> Environnement de demonstration
      </span>
      <span className="text-amber-800">
        Donnees fictives, reinitialisees automatiquement chaque jour.
      </span>
      <span className="inline-flex items-center gap-1 text-amber-800">
        <ShieldAlert size={14} /> MFA optionnel ici ; en production il est obligatoire pour les roles Admin et Manager.
      </span>
    </div>
  );
}
