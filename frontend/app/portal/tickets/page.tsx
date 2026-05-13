'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, LifeBuoy, AlertTriangle } from 'lucide-react';
import { portalApi } from '@/lib/portal-api';
import { formatDate } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Nouveau',
  IN_PROGRESS: 'En cours',
  WAITING_CUSTOMER: 'En attente de votre reponse',
  RESOLVED: 'Resolu',
  CLOSED: 'Clos',
  CANCELLED: 'Annule',
};
const STATUS_COLOR: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  WAITING_CUSTOMER: 'bg-purple-100 text-purple-700',
  RESOLVED: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-slate-100 text-slate-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};
const PRIORITY_LABEL: Record<string, string> = {
  LOW: 'Basse', NORMAL: 'Normale', HIGH: 'Haute', URGENT: 'Urgente',
};

export default function PortalTicketsPage() {
  const [tickets, setTickets] = useState<any[] | null>(null);
  const [filter, setFilter] = useState('open');

  async function load() {
    const all = await portalApi.get('/tickets');
    setTickets(all);
  }
  useEffect(() => { load(); }, []);

  const filtered = !tickets ? [] : tickets.filter((t) => {
    if (filter === 'open') return !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(t.status);
    if (filter === 'closed') return ['RESOLVED', 'CLOSED', 'CANCELLED'].includes(t.status);
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mes tickets</h1>
          <p className="text-sm text-slate-500 mt-1">Suivi de vos demandes de support.</p>
        </div>
        <Link
          href="/portal/tickets/new"
          className="inline-flex items-center gap-2 rounded-md bg-mdo-600 text-white px-4 py-2 text-sm font-medium hover:bg-mdo-700 transition-colors"
        >
          <Plus size={14} /> Nouveau ticket
        </Link>
      </div>

      <div className="flex gap-2">
        {[
          { v: 'open', l: 'En cours' },
          { v: 'closed', l: 'Termines' },
          { v: 'all', l: 'Tous' },
        ].map((f) => (
          <button
            key={f.v}
            onClick={() => setFilter(f.v)}
            className={
              'px-3 py-1.5 rounded-md text-sm transition-colors ' +
              (filter === f.v
                ? 'bg-mdo-600 text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50')
            }
          >
            {f.l}
          </button>
        ))}
      </div>

      {tickets === null ? (
        <div className="text-slate-400">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-10 text-center">
          <LifeBuoy size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-600 dark:text-slate-300">Aucun ticket</p>
          <p className="text-sm text-slate-500 mt-1">
            {filter === 'open' ? 'Vous n\'avez aucun ticket en cours.' : 'Aucun ticket dans cette categorie.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {filtered.map((t) => (
              <li key={t.id}>
                <Link
                  href={'/portal/tickets/' + t.id}
                  className="block px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-400">{t.reference}</span>
                        <span className={'badge text-xs ' + STATUS_COLOR[t.status]}>
                          {STATUS_LABEL[t.status]}
                        </span>
                        {t.priority === 'URGENT' && (
                          <span className="badge text-xs bg-red-100 text-red-700 inline-flex items-center gap-1">
                            <AlertTriangle size={10} /> {PRIORITY_LABEL[t.priority]}
                          </span>
                        )}
                      </div>
                      <p className="font-medium mt-1 truncate">{t.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Cree le {formatDate(t.createdAt)}
                        {t.assignee && ` · pris en charge par ${t.assignee.firstName}`}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
