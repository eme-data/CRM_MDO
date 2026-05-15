'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';

// Affiche un mini-badge dans le header de la sidebar pour les ADMIN/MANAGER
// quand au moins un check de configuration est en erreur ou warning.
// Cliquable -> /admin/health.
//
// Refresh toutes les 5 min en background (pas de pression sur le serveur).

export function HealthBadge() {
  const [summary, setSummary] = useState<{ issues: number; warnings: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await api.get('/system-health/summary');
        if (!cancelled) setSummary(r);
      } catch {
        // Probable 403 si l'utilisateur n'est pas ADMIN/MANAGER -> on ne montre rien
        if (!cancelled) setSummary(null);
      }
    }
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (!summary || (summary.issues === 0 && summary.warnings === 0)) return null;
  const isError = summary.issues > 0;
  return (
    <Link
      href="/admin/health"
      className={
        'flex items-center gap-2 px-3 py-2 mx-2 mb-2 rounded-md text-xs ' +
        (isError ? 'bg-red-900/40 text-red-200 hover:bg-red-900/60' : 'bg-amber-900/40 text-amber-200 hover:bg-amber-900/60')
      }
    >
      <AlertTriangle size={14} />
      <span>
        {summary.issues > 0 && summary.issues + ' erreur' + (summary.issues > 1 ? 's' : '')}
        {summary.issues > 0 && summary.warnings > 0 && ' · '}
        {summary.warnings > 0 && summary.warnings + ' warning' + (summary.warnings > 1 ? 's' : '')}
      </span>
    </Link>
  );
}
