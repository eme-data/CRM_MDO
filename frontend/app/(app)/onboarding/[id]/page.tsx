'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'A faire', IN_PROGRESS: 'En cours', DONE: 'Fait', SKIPPED: 'Ignore',
};
const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  DONE: 'bg-emerald-100 text-emerald-700',
  SKIPPED: 'bg-slate-100 text-slate-400',
};

export default function OnboardingRunPage() {
  const params = useParams();
  const id = params.id as string;
  const [run, setRun] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);

  async function load() { setRun(await api.get('/onboarding/runs/' + id)); }
  useEffect(() => { load(); api.get('/users').then(setUsers); }, [id]);

  async function updateStep(stepId: string, payload: any) {
    try { await api.patch('/onboarding/steps/' + stepId, payload); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  if (!run) return <div>Chargement...</div>;

  const pct = run.totalSteps > 0 ? Math.round(((run.doneSteps + run.skippedSteps) / run.totalSteps) * 100) : 0;

  return (
    <div className="space-y-6">
      <Link href={'/companies/' + run.company.id} className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} className="mr-1" /> Retour a {run.company.name}
      </Link>

      <div>
        <div className="flex items-center gap-3">
          <ListChecks size={28} className="text-mdo-600" />
          <h1 className="text-3xl font-bold">Onboarding — {run.template.name}</h1>
          <span className={'badge ' + (run.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : run.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700')}>
            {run.status}
          </span>
        </div>
        <p className="text-slate-600 mt-1">
          Client : <Link href={'/companies/' + run.company.id} className="text-mdo-600 hover:underline">{run.company.name}</Link>
          {run.contract && <> · Contrat <Link href={'/contracts/' + run.contract.id} className="text-mdo-600 hover:underline">{run.contract.reference}</Link></>}
        </p>
        <div className="mt-3">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold">{pct}%</div>
            <div className="flex-1 bg-slate-200 rounded-full h-3 overflow-hidden">
              <div className="bg-mdo-600 h-3" style={{ width: pct + '%' }} />
            </div>
            <div className="text-xs text-slate-500">{run.doneSteps} faites · {run.skippedSteps} ignorees · sur {run.totalSteps}</div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {run.steps.map((s: any) => (
          <div key={s.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">#{s.position + 1}</span>
                  <h3 className="font-medium">{s.title}</h3>
                  <span className={'badge ' + STATUS_COLOR[s.status]}>{STATUS_LABEL[s.status]}</span>
                </div>
                {s.description && <p className="text-sm text-slate-500 mt-1">{s.description}</p>}
                <div className="text-xs text-slate-400 mt-1 flex gap-3">
                  {s.dueDate && <span>Echeance : {formatDate(s.dueDate)}</span>}
                  {s.doneAt && <span>Fait le {formatDate(s.doneAt)} {s.doneBy && 'par ' + s.doneBy.firstName + ' ' + s.doneBy.lastName}</span>}
                </div>
                {s.notes && <p className="text-xs italic text-slate-600 mt-1">{s.notes}</p>}
              </div>
              <div className="flex flex-col gap-1 items-end">
                <select
                  className="input text-xs py-1"
                  value={s.status}
                  onChange={(e) => updateStep(s.id, { status: e.target.value })}
                >
                  <option value="PENDING">A faire</option>
                  <option value="IN_PROGRESS">En cours</option>
                  <option value="DONE">Fait</option>
                  <option value="SKIPPED">Ignore</option>
                </select>
                <select
                  className="input text-xs py-1"
                  value={s.assigneeId ?? ''}
                  onChange={(e) => updateStep(s.id, { assigneeId: e.target.value || null })}
                >
                  <option value="">Non assigne</option>
                  {users.map((u: any) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
