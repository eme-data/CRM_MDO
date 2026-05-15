'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import { api } from '@/lib/api';

interface Run {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  totalSteps: number;
  doneSteps: number;
  skippedSteps: number;
  template: { id: string; name: string };
  contract?: { id: string; reference: string; offer: string } | null;
}

const STATUS_COLOR: Record<string, string> = {
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export function OnboardingSection({ companyId }: { companyId: string }) {
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    api.get('/onboarding/runs?companyId=' + companyId).then(setRuns).catch(() => setRuns([]));
  }, [companyId]);

  if (runs.length === 0) return null;

  return (
    <div className="card p-4 space-y-2">
      <h2 className="font-semibold flex items-center gap-2">
        <ListChecks size={16} /> Onboarding ({runs.length})
      </h2>
      <ul className="space-y-2">
        {runs.map((r) => {
          const pct = r.totalSteps > 0 ? Math.round(((r.doneSteps + r.skippedSteps) / r.totalSteps) * 100) : 0;
          return (
            <li key={r.id} className="border rounded-md p-3 hover:bg-slate-50">
              <div className="flex items-center justify-between">
                <Link href={'/onboarding/' + r.id} className="font-medium text-mdo-600 hover:underline">{r.template.name}</Link>
                <span className={'badge ' + STATUS_COLOR[r.status]}>{r.status}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div className="bg-mdo-600 h-2" style={{ width: pct + '%' }} />
                </div>
                <span className="text-xs text-slate-500">{pct}% ({r.doneSteps + r.skippedSteps}/{r.totalSteps})</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
