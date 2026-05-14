'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, AlertTriangle, RefreshCw, Info } from 'lucide-react';
import { api } from '@/lib/api';

interface Subscore {
  score: number | null;
  weight: number;
  label: string;
  detail: string;
}

interface Recommendation {
  priority: 1 | 2 | 3;
  title: string;
  linkPath: string | null;
}

interface ScoreData {
  score: number | null;
  level: 'NO_DATA' | 'POOR' | 'AVERAGE' | 'GOOD' | 'EXCELLENT';
  subscores: {
    mfa: Subscore;
    alerts: Subscore;
    assetHygiene: Subscore;
    certificates: Subscore;
    uptime: Subscore;
    documentation: Subscore;
  };
  recommendations: Recommendation[];
  computedAt: string;
}

// Mapping niveau -> classes Tailwind (fond / texte / bordure / accent barre)
const LEVEL_STYLES: Record<ScoreData['level'], { bg: string; text: string; border: string; bar: string; label: string }> = {
  EXCELLENT: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800', bar: 'bg-emerald-500', label: 'Excellent' },
  GOOD: { bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800', bar: 'bg-blue-500', label: 'Bon' },
  AVERAGE: { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', bar: 'bg-amber-500', label: 'Moyen' },
  POOR: { bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800', bar: 'bg-red-500', label: 'Faible' },
  NO_DATA: { bg: 'bg-slate-50 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-700', bar: 'bg-slate-400', label: 'Pas de donnees' },
};

const PRIORITY_BADGE: Record<1 | 2 | 3, string> = {
  1: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  2: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  3: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};
const PRIORITY_LABEL: Record<1 | 2 | 3, string> = { 1: 'Haute', 2: 'Moyenne', 3: 'Basse' };

// Couleur de barre pour un sous-score individuel selon sa valeur (independant
// du niveau global, pour montrer les forces/faiblesses par axe).
function barColor(score: number | null): string {
  if (score === null) return 'bg-slate-300 dark:bg-slate-700';
  if (score >= 85) return 'bg-emerald-500';
  if (score >= 70) return 'bg-blue-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

export function CyberScoreWidget({ companyId }: { companyId: string }) {
  const [data, setData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/companies/' + companyId + '/cyber-score');
      setData(r);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const r = await api.post('/companies/' + companyId + '/cyber-score/refresh');
      setData(r);
    } catch {} finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  if (loading) {
    return (
      <div className="card p-6 animate-pulse">
        <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded" />
      </div>
    );
  }
  if (!data) return null;

  const style = LEVEL_STYLES[data.level];
  const subscoreList = [
    data.subscores.mfa,
    data.subscores.alerts,
    data.subscores.assetHygiene,
    data.subscores.certificates,
    data.subscores.uptime,
    data.subscores.documentation,
  ];
  const computedAgo = (() => {
    const ms = Date.now() - new Date(data.computedAt).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'a l\'instant';
    if (min < 60) return 'il y a ' + min + ' min';
    return 'il y a ' + Math.floor(min / 60) + 'h';
  })();

  return (
    <div className={'card p-6 border-2 ' + style.border + ' ' + style.bg}>
      <div className="flex items-start gap-6">
        {/* Score principal */}
        <div className="flex-shrink-0">
          <div className="flex items-baseline gap-2">
            <span className={'text-5xl font-bold tabular-nums ' + style.text}>
              {data.score ?? '-'}
            </span>
            <span className={'text-lg ' + style.text + ' opacity-70'}>/100</span>
          </div>
          <div className={'mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ' + style.text}>
            {data.level === 'POOR' || data.level === 'AVERAGE' ? (
              <AlertTriangle size={14} />
            ) : (
              <ShieldCheck size={14} />
            )}
            {style.label}
          </div>
        </div>

        {/* Titre + actions */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Cyber Risk Score
            </h2>
            <button
              onClick={refresh}
              disabled={refreshing}
              className="btn btn-secondary text-xs"
              title="Recalculer le score"
            >
              <RefreshCw size={14} className={'mr-1 ' + (refreshing ? 'animate-spin' : '')} />
              {refreshing ? 'Calcul...' : 'Recalculer'}
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Mis a jour {computedAgo} · base sur MFA, alertes M365, assets, certificats, uptime et documentation
          </p>

          {/* Breakdown sous-scores */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
            {subscoreList.map((s) => (
              <div key={s.label} className="bg-white dark:bg-slate-900 rounded-md p-3 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate" title={s.label}>
                    {s.label}
                  </span>
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {s.score === null ? 'N/A' : Math.round(s.score)}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
                  <div
                    className={'h-full rounded transition-all ' + barColor(s.score)}
                    style={{ width: (s.score ?? 0) + '%' }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate" title={s.detail}>
                  {s.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recommandations */}
      {data.recommendations.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
            <Info size={14} /> Actions recommandees
          </h3>
          <ul className="space-y-2">
            {data.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className={'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase mt-0.5 ' + PRIORITY_BADGE[rec.priority]}>
                  {PRIORITY_LABEL[rec.priority]}
                </span>
                <span className="text-slate-700 dark:text-slate-300 flex-1">
                  {rec.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.recommendations.length === 0 && data.score !== null && data.score >= 85 && (
        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <ShieldCheck size={16} /> Aucune action prioritaire — posture excellente.
        </div>
      )}
    </div>
  );
}
