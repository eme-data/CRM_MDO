'use client';
import { useEffect, useState } from 'react';
import { HardDrive, CheckCircle2, XCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { portalApi } from '@/lib/portal-api';
import { formatDateTime } from '@/lib/utils';

interface PortalBackup {
  id: string;
  name: string;
  vendor: string | null;
  sourceType: string;
  expectedFrequencyHours: number;
  lastRunStatus: 'SUCCESS' | 'FAILED' | 'PARTIAL' | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
}

function statusBadge(b: PortalBackup) {
  if (!b.lastRunAt) {
    return <span className="inline-flex items-center gap-1 text-slate-400"><HelpCircle size={14} /> Pas de donnees</span>;
  }
  // En retard si le dernier success > expectedFrequencyHours
  const isOverdue = b.lastSuccessAt
    ? Date.now() - new Date(b.lastSuccessAt).getTime() > b.expectedFrequencyHours * 3600_000
    : true;
  if (b.lastRunStatus === 'SUCCESS' && !isOverdue) {
    return <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={14} /> A jour</span>;
  }
  if (b.lastRunStatus === 'SUCCESS' && isOverdue) {
    return <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle size={14} /> En retard</span>;
  }
  if (b.lastRunStatus === 'PARTIAL') {
    return <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle size={14} /> Partiel</span>;
  }
  return <span className="inline-flex items-center gap-1 text-red-700 font-semibold"><XCircle size={14} /> Echec</span>;
}

export default function PortalBackupsPage() {
  const [items, setItems] = useState<PortalBackup[] | null>(null);

  useEffect(() => {
    portalApi.get('/backups')
      .then(setItems)
      .catch((err) => toast.error('Chargement backups : ' + err.message));
  }, []);

  if (!items) return <div className="text-slate-400">Chargement...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <HardDrive size={24} className="text-mdo-600" />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Mes sauvegardes</h1>
      </div>
      <p className="text-sm text-slate-500">
        Etat des jobs de sauvegarde supervises par MDO Services. Une alerte est
        declenchee si un job depasse sa frequence attendue sans succes.
      </p>

      {items.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-400">
          Aucun job de sauvegarde supervise pour l'instant.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left">
              <tr>
                <th className="p-3 font-medium">Nom</th>
                <th className="p-3 font-medium">Outil</th>
                <th className="p-3 font-medium">Statut</th>
                <th className="p-3 font-medium">Dernier run</th>
                <th className="p-3 font-medium">Dernier succes</th>
                <th className="p-3 font-medium">Frequence</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-3">
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-slate-500">{b.sourceType}</div>
                  </td>
                  <td className="p-3 text-slate-600">{b.vendor ?? '-'}</td>
                  <td className="p-3">{statusBadge(b)}</td>
                  <td className="p-3 text-xs text-slate-500">
                    {b.lastRunAt ? formatDateTime(b.lastRunAt) : '-'}
                  </td>
                  <td className="p-3 text-xs text-slate-500">
                    {b.lastSuccessAt ? formatDateTime(b.lastSuccessAt) : '-'}
                  </td>
                  <td className="p-3 text-xs text-slate-500">
                    Toutes les {b.expectedFrequencyHours}h
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
