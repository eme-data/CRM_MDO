'use client';
import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';

interface DimensionScore {
  score: number;
  weight: number;
  weighted: number;
  details: Record<string, any>;
}

interface HealthScore {
  overall: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  dimensions: {
    support: DimensionScore;
    financial: DimensionScore;
    engagement: DimensionScore;
    nps: DimensionScore;
    cyber: DimensionScore;
  };
  alerts: string[];
}

const RISK_COLOR = {
  LOW: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  MEDIUM: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  HIGH: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
};

const RISK_LABEL = { LOW: 'Sain', MEDIUM: 'Vigilance', HIGH: 'Risque eleve' };
const DIM_LABEL: Record<string, string> = {
  support: 'Support',
  financial: 'Financier',
  engagement: 'Engagement',
  nps: 'Satisfaction',
  cyber: 'Cyber',
};

export function HealthScoreWidget({ companyId }: { companyId: string }) {
  const [score, setScore] = useState<HealthScore | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get('/health-score/companies/' + companyId).then(setScore).catch(() => setScore(null));
  }, [companyId]);

  if (!score) return null;
  const c = RISK_COLOR[score.risk];

  return (
    <div className={'card p-4 border-2 ' + c.border + ' ' + c.bg}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity size={20} className={c.text} />
          <div>
            <h3 className="font-semibold text-sm">Health Score</h3>
            <p className={'text-xs ' + c.text}>{RISK_LABEL[score.risk]}</p>
          </div>
        </div>
        <div className="text-right">
          <div className={'text-3xl font-bold ' + c.text}>{score.overall}</div>
          <div className="text-[10px] text-slate-500">/ 100</div>
        </div>
      </div>

      {score.alerts.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-slate-700">
          {score.alerts.slice(0, 3).map((a, i) => (
            <li key={i} className="flex items-start gap-1">
              <AlertTriangle size={12} className="text-amber-500 mt-0.5 shrink-0" /> <span>{a}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="mt-3 text-xs text-mdo-600 hover:underline flex items-center"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Detail dimensions
      </button>

      {open && (
        <div className="mt-3 grid grid-cols-5 gap-1 text-xs">
          {Object.entries(score.dimensions).map(([key, d]) => (
            <div key={key} className="text-center bg-white/60 rounded p-2">
              <div className="text-[10px] text-slate-500">{DIM_LABEL[key]}</div>
              <div className="font-bold text-base">{d.score}</div>
              <div className="text-[9px] text-slate-400">×{d.weight}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
