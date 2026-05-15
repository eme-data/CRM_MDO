'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmDialog';

interface Assessment {
  id: string;
  scorePct: number;
  totalControls: number;
  compliantCount: number;
  nonCompliantCount: number;
  inProgressCount: number;
  notStartedCount: number;
  framework: { id: string; code: string; name: string };
  owner?: { id: string; firstName: string; lastName: string } | null;
  nextReviewAt?: string | null;
}

function scoreColor(pct: number) {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-red-600';
}

export function ComplianceSection({ companyId }: { companyId: string }) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [chosenFw, setChosenFw] = useState('');
  const confirm = useConfirm();

  async function load() {
    setAssessments(await api.get('/compliance/companies/' + companyId + '/assessments'));
  }

  useEffect(() => {
    load();
    api.get('/compliance/frameworks').then(setFrameworks);
  }, [companyId]);

  async function start() {
    if (!chosenFw) return;
    try {
      await api.post('/compliance/companies/' + companyId + '/assessments', { frameworkId: chosenFw });
      toast.success('Audit demarre');
      setAdding(false);
      setChosenFw('');
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function remove(a: Assessment) {
    const ok = await confirm({
      title: 'Supprimer l\'audit ' + a.framework.code + ' ?',
      message: 'L\'historique des controles sera perdu (Activity garde la trace de la suppression).',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    await api.delete('/compliance/assessments/' + a.id);
    toast.success('Audit supprime');
    load();
  }

  const usedFwIds = new Set(assessments.map((a) => a.framework.id));
  const availableFw = frameworks.filter((f) => !usedFwIds.has(f.id));

  return (
    <div className="card p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          <ShieldCheck size={16} /> Compliance / Audit
        </h2>
        {availableFw.length > 0 && !adding && (
          <button onClick={() => setAdding(true)} className="btn btn-secondary text-xs py-1">
            <Plus size={14} className="mr-1" /> Demarrer audit
          </button>
        )}
      </div>

      {adding && (
        <div className="border rounded-md p-3 bg-mdo-50 space-y-2">
          <select className="input" value={chosenFw} onChange={(e) => setChosenFw(e.target.value)}>
            <option value="">-- Choisir un referentiel --</option>
            {availableFw.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={start} className="btn btn-primary text-xs py-1" disabled={!chosenFw}>Demarrer</button>
            <button onClick={() => { setAdding(false); setChosenFw(''); }} className="btn btn-secondary text-xs py-1">Annuler</button>
          </div>
        </div>
      )}

      {assessments.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun audit en cours. Demarrez un audit NIS2 ou ISO 27001 pour ce client.</p>
      ) : (
        <ul className="space-y-2">
          {assessments.map((a) => (
            <li key={a.id} className="border rounded-md p-3 hover:bg-slate-50">
              <div className="flex items-center justify-between">
                <Link href={'/compliance/' + a.id} className="font-medium text-mdo-600 hover:underline">
                  {a.framework.name}
                </Link>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className={'text-xl font-bold ' + scoreColor(a.scorePct)}>{a.scorePct}%</div>
                    <div className="text-[10px] text-slate-500">{a.compliantCount}/{a.totalControls - a.notStartedCount} evalues</div>
                  </div>
                  <button onClick={() => remove(a)} className="text-red-500 hover:text-red-700" title="Supprimer">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="flex gap-2 text-xs mt-1">
                <span className="text-emerald-700">Conforme {a.compliantCount}</span>
                <span className="text-red-600">Ecart {a.nonCompliantCount}</span>
                <span className="text-blue-600">En cours {a.inProgressCount}</span>
                <span className="text-slate-500">A demarrer {a.notStartedCount}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
