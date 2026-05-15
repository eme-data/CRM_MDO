'use client';
import { useEffect, useState } from 'react';
import { Clock, Play, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useReloadOnFocus } from '@/lib/useReloadOnFocus';
import { formatDateTime } from '@/lib/utils';

interface CronJob {
  name: string;
  cronExpression: string;
  timeZone: string | null;
  running: boolean;
  nextDateAt: string | null;
  lastDateAt: string | null;
}

interface HistoryEntry {
  id: string;
  action: string;
  entityId: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string };
}

// Documentation cron pour les utilisateurs non techniciens
const HUMAN_LABEL: Record<string, string> = {
  'audit-seal': 'Scellement chaine integrite Activity (toutes les 5 min)',
  'backup-overdue-check': 'Verification backups clients en retard (06:00)',
  'call-transcribe-auto': 'Transcription auto des appels (toutes les 15 min)',
  'contract-alerts': 'Alertes renouvellement contrats',
  'customer-success-reminder': 'Rappel J-7 QBR aux owners (08:00)',
  'customer-success-schedule': 'Programmation auto QBR mensuelle (1er a 09:00)',
  'drip-daily-send': 'Envoi des sequences emails (10:00)',
  'email-security-daily': 'Verification SPF/DMARC/DKIM (03:30)',
  'monthly-client-reports': 'Rapports mensuels clients (1er a 08:00)',
  'patch-management-sync': 'Sync devices Intune (04:30)',
  'quotes-expire': 'Marque les devis expires (06:15)',
  'recurring-tasks-daily': 'Generation taches recurrentes (06:30)',
  'system-backup-daily': 'Backup CRM quotidien (02:30)',
  'system-backup-cleanup': 'Nettoyage backups > 30j (04:00)',
  'workflow-daily': 'Evaluation regles workflow (07:00)',
};

export default function CronJobsPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [running, setRunning] = useState<string | null>(null);

  async function load() {
    const [j, h] = await Promise.all([
      api.get('/cron-jobs'),
      api.get('/cron-jobs/history?limit=20'),
    ]);
    setJobs(j); setHistory(h);
  }
  useEffect(() => { load(); }, []);
  useReloadOnFocus(load);

  async function runNow(name: string) {
    setRunning(name);
    try {
      await api.post('/cron-jobs/' + encodeURIComponent(name) + '/run');
      toast.success('Cron "' + name + '" execute');
      setTimeout(load, 1000);
    } catch (err: any) { toast.error(err.message); }
    finally { setRunning(null); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Clock size={28} className="text-mdo-600" /> Cron jobs &amp; planificateur
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Visualise tous les jobs planifies actuellement enregistres + permet
          de les declencher a la demande (utile pour debug ou rattrapage).
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Nom (technique)</th>
              <th className="p-3 font-medium">Description</th>
              <th className="p-3 font-medium font-mono text-xs">Expression</th>
              <th className="p-3 font-medium">TZ</th>
              <th className="p-3 font-medium text-center">Statut</th>
              <th className="p-3 font-medium">Prochaine execution</th>
              <th className="p-3 font-medium">Derniere</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-slate-400">Chargement...</td></tr>
            ) : jobs.map((j) => (
              <tr key={j.name} className="border-t hover:bg-slate-50">
                <td className="p-3 font-mono text-xs">{j.name}</td>
                <td className="p-3 text-xs text-slate-600">{HUMAN_LABEL[j.name] ?? '—'}</td>
                <td className="p-3 font-mono text-xs">{j.cronExpression}</td>
                <td className="p-3 text-xs">{j.timeZone ?? 'system'}</td>
                <td className="p-3 text-center">
                  {j.running ? (
                    <CheckCircle2 size={16} className="text-emerald-600 mx-auto" />
                  ) : (
                    <XCircle size={16} className="text-red-500 mx-auto" />
                  )}
                </td>
                <td className="p-3 text-xs">{j.nextDateAt ? formatDateTime(j.nextDateAt) : '-'}</td>
                <td className="p-3 text-xs text-slate-500">{j.lastDateAt ? formatDateTime(j.lastDateAt) : 'jamais'}</td>
                <td className="p-3">
                  <button
                    onClick={() => runNow(j.name)}
                    disabled={running === j.name}
                    className="btn btn-secondary text-xs py-1"
                    title="Executer maintenant"
                  >
                    {running === j.name ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <h2 className="font-semibold mb-3 text-sm">Historique declenchements manuels</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun declenchement manuel enregistre.</p>
        ) : (
          <ul className="text-xs space-y-1">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between border-b last:border-0 py-1">
                <span><strong>{h.entityId}</strong> par {h.user.firstName} {h.user.lastName}</span>
                <span className="text-slate-500">{formatDateTime(h.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
