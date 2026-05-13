'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, RefreshCw } from 'lucide-react';

// Page publique : pas d'auth requise. Sert d'indicateur de transparence sur
// les services internes MDO Services (CRM, site, etc.).
// Auto-refresh toutes les 60 secondes.

interface StatusItem {
  name: string;
  status: 'OPERATIONAL' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
  uptime30dPct: number | null;
  responseMs: number | null;
}

interface StatusOverview {
  overall: 'OPERATIONAL' | 'DEGRADED' | 'DOWN';
  items: StatusItem[];
  lastIncident: { startedAt: string; resolvedAt: string | null; daysAgo: number } | null;
  updatedAt: string;
}

const OVERALL_CONF = {
  OPERATIONAL: {
    label: 'Tous les services sont operationnels',
    bg: 'bg-emerald-500',
    icon: CheckCircle2,
  },
  DEGRADED: {
    label: 'Service degrade',
    bg: 'bg-amber-500',
    icon: AlertTriangle,
  },
  DOWN: {
    label: 'Incident en cours',
    bg: 'bg-red-500',
    icon: XCircle,
  },
};

const ITEM_CONF = {
  OPERATIONAL: { label: 'Operationnel', cls: 'text-emerald-600', icon: CheckCircle2 },
  DEGRADED: { label: 'Degrade', cls: 'text-amber-600', icon: AlertTriangle },
  DOWN: { label: 'En panne', cls: 'text-red-600', icon: XCircle },
  UNKNOWN: { label: 'Inconnu', cls: 'text-slate-400', icon: HelpCircle },
};

export default function StatusPage() {
  const [data, setData] = useState<StatusOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/status/public', { cache: 'no-store' });
      if (!res.ok) throw new Error('Service indisponible');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message ?? 'Erreur');
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  const overall = data ? OVERALL_CONF[data.overall] : null;
  const OverallIcon = overall?.icon;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
        <header className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">MDO Services - Statut</h1>
          <p className="text-sm text-slate-500 mt-2">
            Etat en temps reel de nos services. Mise a jour automatique toutes les minutes.
          </p>
        </header>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 p-4 mb-6 text-sm text-red-700 dark:text-red-200">
            Impossible de recuperer le statut : {error}
          </div>
        )}

        {!data && !error && (
          <div className="text-center text-slate-400 py-12">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
            Chargement...
          </div>
        )}

        {data && overall && OverallIcon && (
          <>
            <div className={`rounded-xl ${overall.bg} text-white p-6 mb-6 shadow-lg`}>
              <div className="flex items-center gap-4">
                <OverallIcon size={36} className="shrink-0" />
                <div>
                  <p className="text-xl sm:text-2xl font-semibold">{overall.label}</p>
                  <p className="text-sm opacity-90 mt-0.5">
                    Derniere mise a jour : {new Date(data.updatedAt).toLocaleString('fr-FR')}
                  </p>
                </div>
              </div>
            </div>

            {data.items.length === 0 ? (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center text-slate-500">
                Aucun service publie pour le moment.
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                <h2 className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 font-semibold text-sm uppercase tracking-wide text-slate-500">
                  Services
                </h2>
                <ul>
                  {data.items.map((item, idx) => {
                    const conf = ITEM_CONF[item.status];
                    const ItemIcon = conf.icon;
                    return (
                      <li
                        key={idx}
                        className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <ItemIcon size={20} className={`${conf.cls} shrink-0`} />
                          <span className="font-medium truncate">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-4 shrink-0 text-sm">
                          {item.uptime30dPct !== null && (
                            <span className="text-slate-500 hidden sm:inline">
                              {item.uptime30dPct.toFixed(2)} % sur 30j
                            </span>
                          )}
                          {item.responseMs !== null && (
                            <span className="text-slate-400 text-xs hidden md:inline">
                              {item.responseMs} ms
                            </span>
                          )}
                          <span className={`${conf.cls} font-medium text-sm`}>{conf.label}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {data.lastIncident && (
              <div className="mt-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 text-sm">
                <h3 className="font-semibold mb-2">Dernier incident</h3>
                <p className="text-slate-600 dark:text-slate-300">
                  Il y a {data.lastIncident.daysAgo} jour(s) ·{' '}
                  {data.lastIncident.resolvedAt ? (
                    <span className="text-emerald-600">Resolu</span>
                  ) : (
                    <span className="text-red-600">En cours</span>
                  )}
                </p>
              </div>
            )}

            <footer className="mt-10 text-center text-xs text-slate-400">
              <a href="https://www.mdoservices.fr" className="hover:underline">MDO Services</a>
              {' - Prestataire IT et Cybersecurite - Occitanie'}
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
