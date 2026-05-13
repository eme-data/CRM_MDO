'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, LifeBuoy, Server, Plus, ArrowRight } from 'lucide-react';
import { portalApi } from '@/lib/portal-api';

interface Counts {
  openTickets: number;
  activeContracts: number;
  monitoredAssets: number;
}

export default function PortalHomePage() {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    Promise.all([
      portalApi.get('/tickets'),
      portalApi.get('/contracts'),
      portalApi.get('/assets'),
    ])
      .then(([tickets, contracts, assets]: any[]) => {
        setCounts({
          openTickets: tickets.filter((t: any) => !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(t.status)).length,
          activeContracts: contracts.filter((c: any) => c.status === 'ACTIVE').length,
          monitoredAssets: assets.filter((a: any) => a.monitoringEnabled).length,
        });
      })
      .catch(() => setCounts({ openTickets: 0, activeContracts: 0, monitoredAssets: 0 }));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Bienvenue</h1>
        <p className="text-sm text-slate-500 mt-1">
          Retrouvez ici vos contrats, tickets de support et assets surveilles.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <PortalCard
          icon={LifeBuoy}
          label="Tickets ouverts"
          value={counts?.openTickets}
          href="/portal/tickets"
          color="text-blue-500"
        />
        <PortalCard
          icon={FileText}
          label="Contrats actifs"
          value={counts?.activeContracts}
          href="/portal/contracts"
          color="text-emerald-500"
        />
        <PortalCard
          icon={Server}
          label="Assets surveilles"
          value={counts?.monitoredAssets}
          href="/portal/assets"
          color="text-purple-500"
        />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-semibold mb-2">Besoin d'aide ?</h2>
        <p className="text-sm text-slate-500 mb-4">
          Ouvrez un ticket de support pour signaler un incident, faire une demande ou poser une question.
          L'equipe MDO Services prend en charge votre demande dans les meilleurs delais.
        </p>
        <Link
          href="/portal/tickets/new"
          className="inline-flex items-center gap-2 rounded-md bg-mdo-600 text-white px-4 py-2 text-sm font-medium hover:bg-mdo-700 transition-colors"
        >
          <Plus size={14} /> Nouveau ticket
        </Link>
      </div>
    </div>
  );
}

function PortalCard({
  icon: Icon,
  label,
  value,
  href,
  color,
}: {
  icon: any;
  label: string;
  value: number | undefined;
  href: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 hover:border-mdo-400 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums">
            {value !== undefined ? value : '—'}
          </p>
        </div>
        <Icon size={20} className={color + ' shrink-0'} />
      </div>
      <div className="mt-3 inline-flex items-center gap-1 text-xs text-mdo-600 group-hover:gap-2 transition-all">
        Voir le detail <ArrowRight size={12} />
      </div>
    </Link>
  );
}
