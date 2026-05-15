'use client';
import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { portalApi } from '@/lib/portal-api';
import { formatDateTime } from '@/lib/utils';

interface PortalMonitor {
  id: string;
  name: string;
  url: string;
  lastStatus: 'UP' | 'DOWN' | null;
  lastCheckedAt: string | null;
  lastResponseMs: number | null;
  intervalMinutes: number;
}

function StatusBadge({ status }: { status: PortalMonitor['lastStatus'] }) {
  if (status === 'UP')
    return <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={14} /> En ligne</span>;
  if (status === 'DOWN')
    return <span className="inline-flex items-center gap-1 text-red-700 font-semibold"><XCircle size={14} /> Hors ligne</span>;
  return <span className="inline-flex items-center gap-1 text-slate-400"><HelpCircle size={14} /> Pas encore verifie</span>;
}

export default function PortalUptimePage() {
  const [items, setItems] = useState<PortalMonitor[] | null>(null);

  useEffect(() => {
    portalApi.get('/uptime')
      .then(setItems)
      .catch((err) => toast.error('Chargement uptime : ' + err.message));
  }, []);

  if (!items) return <div className="text-slate-400">Chargement...</div>;

  const upCount = items.filter((m) => m.lastStatus === 'UP').length;
  const downCount = items.filter((m) => m.lastStatus === 'DOWN').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Activity size={24} className="text-mdo-600" />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Etat des sites</h1>
      </div>
      <p className="text-sm text-slate-500">
        Etat en temps reel des sites web et services surveilles par MDO Services.
        Verification automatique toutes les {items[0]?.intervalMinutes ?? 5} minutes.
      </p>

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs uppercase text-slate-500">Total</p>
            <p className="text-2xl font-bold tabular-nums">{items.length}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs uppercase text-slate-500">En ligne</p>
            <p className="text-2xl font-bold text-emerald-600 tabular-nums">{upCount}</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-xs uppercase text-slate-500">Hors ligne</p>
            <p className="text-2xl font-bold text-red-600 tabular-nums">{downCount}</p>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-400">
          Aucun site surveille pour l'instant.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left">
              <tr>
                <th className="p-3 font-medium">Site</th>
                <th className="p-3 font-medium">Statut</th>
                <th className="p-3 font-medium">Latence</th>
                <th className="p-3 font-medium">Dernier check</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr
                  key={m.id}
                  className={
                    'border-t border-slate-100 dark:border-slate-800 ' +
                    (m.lastStatus === 'DOWN' ? 'bg-red-50 dark:bg-red-900/20' : '')
                  }
                >
                  <td className="p-3">
                    <div className="font-medium">{m.name}</div>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-500 hover:underline font-mono"
                    >
                      {m.url}
                    </a>
                  </td>
                  <td className="p-3"><StatusBadge status={m.lastStatus} /></td>
                  <td className="p-3 text-xs">{m.lastResponseMs != null ? m.lastResponseMs + ' ms' : '-'}</td>
                  <td className="p-3 text-xs text-slate-500">
                    {m.lastCheckedAt ? formatDateTime(m.lastCheckedAt) : 'jamais'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
