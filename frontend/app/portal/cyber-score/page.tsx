'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { portalApi } from '@/lib/portal-api';
import { formatDateTime } from '@/lib/utils';

interface CyberScore {
  score: number | null;
  maxScore: number | null;
  percent: number | null;
  lastSyncAt: string | null;
  openAlerts: number;
}

function scoreColor(percent: number | null): string {
  if (percent == null) return 'text-slate-400';
  if (percent >= 70) return 'text-emerald-600';
  if (percent >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function scoreLabel(percent: number | null): string {
  if (percent == null) return 'Non disponible';
  if (percent >= 70) return 'Bon';
  if (percent >= 50) return 'A ameliorer';
  return 'Critique';
}

export default function PortalCyberScorePage() {
  const [data, setData] = useState<CyberScore | null | 'none'>(null);

  useEffect(() => {
    portalApi.get('/cyber-score')
      .then((r) => setData(r ?? 'none'))
      .catch((err) => toast.error('Chargement cyber score : ' + err.message));
  }, []);

  if (data === null) return <div className="text-slate-400">Chargement...</div>;

  if (data === 'none') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <ShieldCheck size={24} className="text-mdo-600" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Cyber Score Microsoft 365</h1>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-500">
          Aucun tenant Microsoft 365 raccorde pour votre societe.
          <p className="text-xs text-slate-400 mt-2">
            Contactez MDO Services si vous souhaitez activer la surveillance Microsoft Secure Score.
          </p>
        </div>
      </div>
    );
  }

  const pct = data.percent;
  const color = scoreColor(pct);
  const label = scoreLabel(pct);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ShieldCheck size={24} className="text-mdo-600" />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Cyber Score Microsoft 365</h1>
      </div>
      <p className="text-sm text-slate-500">
        Microsoft Secure Score evalue la posture de securite de votre tenant Microsoft 365
        sur des criteres : MFA, conformite des appareils, partage externe, alertes...
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 md:col-span-2">
          <p className="text-xs uppercase text-slate-500">Score actuel</p>
          <div className="flex items-baseline gap-3 mt-2">
            <span className={'text-5xl font-bold tabular-nums ' + color}>
              {pct != null ? pct.toFixed(0) : '-'}
            </span>
            <span className="text-2xl text-slate-400">/100</span>
            <span className={'text-sm font-medium ' + color}>{label}</span>
          </div>
          {data.score != null && data.maxScore != null && (
            <p className="text-xs text-slate-500 mt-2">
              {data.score.toFixed(0)} / {data.maxScore.toFixed(0)} points Microsoft
            </p>
          )}
          {pct != null && (
            <div className="mt-4 w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
              <div
                className={
                  'h-3 transition-all ' +
                  (pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500')
                }
                style={{ width: pct + '%' }}
              />
            </div>
          )}
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6">
          <p className="text-xs uppercase text-slate-500 flex items-center gap-1.5">
            <AlertTriangle size={12} /> Alertes ouvertes
          </p>
          <p
            className={
              'text-5xl font-bold tabular-nums mt-2 ' +
              (data.openAlerts === 0 ? 'text-emerald-600' : 'text-red-600')
            }
          >
            {data.openAlerts}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            {data.openAlerts === 0
              ? 'Aucune alerte de securite non resolue.'
              : 'Alertes Microsoft Defender en cours de traitement par MDO.'}
          </p>
        </div>
      </div>

      {data.lastSyncAt && (
        <p className="text-xs text-slate-400">
          Derniere mise a jour : {formatDateTime(data.lastSyncAt)} (synchronise automatiquement chaque jour)
        </p>
      )}
    </div>
  );
}
