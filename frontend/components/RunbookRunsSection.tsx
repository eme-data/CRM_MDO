'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ListChecks, Play, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

const CATEGORY_LABEL: Record<string, string> = {
  ONBOARDING: 'Onboarding', AUDIT: 'Audit', PATCHING: 'Patching', INCIDENT: 'Incident', OFFBOARDING: 'Offboarding', AUTRE: 'Autre',
};

export function RunbookRunsSection({ companyId }: { companyId: string }) {
  const [runs, setRuns] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [picking, setPicking] = useState(false);
  const [selectedRunbookId, setSelectedRunbookId] = useState('');
  const [openRun, setOpenRun] = useState<any | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function load() {
    const [r, c] = await Promise.all([
      api.get('/runbook-runs?companyId=' + companyId),
      api.get('/runbooks'),
    ]);
    setRuns(r);
    setCatalog(c);
  }
  useEffect(() => { load(); }, [companyId]);

  async function start() {
    if (!selectedRunbookId) return;
    try {
      const run = await api.post('/runbook-runs', { runbookId: selectedRunbookId, companyId });
      toast.success('Procedure demarree');
      setPicking(false);
      setSelectedRunbookId('');
      setOpenRun(run);
      load();
    } catch (err: any) { toast.error(err.message); }
  }
  async function openRunDetail(id: string) {
    const r = await api.get('/runbook-runs/' + id);
    setOpenRun(r);
    const ns: Record<string, string> = {};
    for (const [sid, v] of Object.entries((r.state ?? {}) as Record<string, any>)) {
      if (v?.note) ns[sid] = v.note;
    }
    setNotes(ns);
  }
  async function toggleStep(stepId: string) {
    if (!openRun) return;
    const cur = openRun.state?.[stepId] ?? {};
    const next = {
      ...openRun.state,
      [stepId]: cur.done
        ? { ...cur, done: false, doneAt: undefined }
        : { ...cur, done: true, doneAt: new Date().toISOString(), note: notes[stepId] },
    };
    const updated = await api.patch('/runbook-runs/' + openRun.id, { state: next });
    setOpenRun(updated);
    load();
  }
  async function saveNote(stepId: string) {
    if (!openRun) return;
    const cur = openRun.state?.[stepId] ?? {};
    const next = { ...openRun.state, [stepId]: { ...cur, note: notes[stepId] } };
    const updated = await api.patch('/runbook-runs/' + openRun.id, { state: next });
    setOpenRun(updated);
    toast.success('Note enregistree');
  }
  async function removeRun(id: string) {
    if (!confirm('Supprimer cette execution ? Le runbook reste dans le catalogue.')) return;
    try {
      await api.delete('/runbook-runs/' + id);
      if (openRun?.id === id) setOpenRun(null);
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="card p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2"><ListChecks size={20} /> Procedures ({runs.length})</h2>
        <button onClick={() => setPicking(!picking)} className="btn btn-primary text-xs">
          <Play size={12} className="mr-1" /> Demarrer un runbook
        </button>
      </div>

      {picking && (
        <div className="border border-slate-200 dark:border-slate-700 rounded p-3 space-y-2 bg-slate-50 dark:bg-slate-900">
          {catalog.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun runbook dans le catalogue. <a href="/admin/runbooks" className="text-mdo-600 hover:underline">En creer un</a>.</p>
          ) : (
            <>
              <select className="input text-sm" value={selectedRunbookId} onChange={(e) => setSelectedRunbookId(e.target.value)}>
                <option value="">-- Choisir une procedure --</option>
                {catalog.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.name} ({CATEGORY_LABEL[r.category]} - {r.steps.length} etapes)</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button onClick={start} className="btn btn-primary text-xs"><Play size={12} className="mr-1" /> Demarrer</button>
                <button onClick={() => setPicking(false)} className="btn btn-secondary text-xs">Annuler</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        {runs.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Aucune procedure executee</p>}
        {runs.map((r: any) => {
          const total = Object.keys(r.runbook?.steps ?? {}).length || (catalog.find((c: any) => c.id === r.runbookId)?.steps?.length ?? 0);
          const done = Object.values((r.state ?? {}) as Record<string, any>).filter((v) => v?.done).length;
          return (
            <div key={r.id} className="border border-slate-200 dark:border-slate-700 rounded p-3 hover:bg-slate-50 dark:hover:bg-slate-700/30">
              <div className="flex justify-between items-start">
                <button onClick={() => openRunDetail(r.id)} className="text-left flex-1">
                  <div className="font-medium">{r.runbook.name}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    <span className="badge bg-slate-100 text-slate-600 mr-2">{CATEGORY_LABEL[r.runbook.category]}</span>
                    Demarre le {formatDateTime(r.startedAt)}
                    {r.completedAt && <> - <span className="text-emerald-600">termine le {formatDateTime(r.completedAt)}</span></>}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {done} etape(s) cochee(s){total > 0 && ' / ' + total}
                  </div>
                </button>
                <button onClick={() => removeRun(r.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>

      {openRun && (
        <div className="border-2 border-mdo-300 rounded p-4 bg-mdo-50/30 dark:bg-mdo-900/10 space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold">{openRun.runbook.name}</h3>
              <p className="text-xs text-slate-500">{openRun.runbook.description}</p>
            </div>
            <button onClick={() => setOpenRun(null)} className="text-slate-500 hover:text-slate-700 text-xs">Fermer</button>
          </div>
          <ul className="space-y-2">
            {openRun.runbook.steps.map((s: any) => {
              const state = openRun.state?.[s.id] ?? {};
              return (
                <li key={s.id} className={'border border-slate-200 dark:border-slate-700 rounded p-2 ' + (state.done ? 'bg-emerald-50 dark:bg-emerald-900/10' : 'bg-white dark:bg-slate-900')}>
                  <div className="flex items-start gap-2">
                    <button onClick={() => toggleStep(s.id)} className={state.done ? 'text-emerald-600' : 'text-slate-400 hover:text-mdo-600'}>
                      {state.done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    </button>
                    <div className="flex-1">
                      <div className="text-sm">
                        <strong className={state.done ? 'line-through text-slate-500' : ''}>{s.title}</strong>
                        {!s.required && <span className="text-xs text-slate-400 ml-2">(optionnel)</span>}
                        {s.estimatedMin && <span className="text-xs text-slate-400 ml-2">~{s.estimatedMin} min</span>}
                      </div>
                      {s.details && <pre className="text-xs text-slate-600 whitespace-pre-wrap mt-1 font-sans">{s.details}</pre>}
                      {state.done && state.doneAt && (
                        <div className="text-xs text-emerald-600 mt-1">Coche le {formatDateTime(state.doneAt)}</div>
                      )}
                      <div className="flex gap-1 mt-1">
                        <input
                          className="input text-xs"
                          placeholder="Note (optionnel)"
                          value={notes[s.id] ?? ''}
                          onChange={(e) => setNotes({ ...notes, [s.id]: e.target.value })}
                        />
                        <button onClick={() => saveNote(s.id)} className="btn btn-secondary text-xs">Note</button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
