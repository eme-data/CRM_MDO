'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ListChecks, Plus, Trash2, Edit, Save, ArrowUp, ArrowDown, Wand2 } from 'lucide-react';
import { api } from '@/lib/api';

const CATEGORIES = ['ONBOARDING', 'AUDIT', 'PATCHING', 'INCIDENT', 'OFFBOARDING', 'AUTRE'] as const;
const CATEGORY_LABEL: Record<string, string> = {
  ONBOARDING: 'Onboarding', AUDIT: 'Audit', PATCHING: 'Patching', INCIDENT: 'Incident', OFFBOARDING: 'Offboarding', AUTRE: 'Autre',
};

export default function AdminRunbooksPage() {
  const [items, setItems] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | 'new' | null>(null);
  const [draft, setDraft] = useState<any>({ name: '', category: 'AUTRE', description: '', steps: [] });

  async function load() {
    setItems(await api.get('/runbooks'));
    setSuggestions(await api.get('/runbooks/suggestions'));
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setDraft({ name: '', category: 'AUTRE', description: '', steps: [{ title: '', required: true }] });
    setEditing('new');
  }
  function openEdit(r: any) {
    setDraft({ ...r, steps: r.steps.map((s: any) => ({ ...s })) });
    setEditing(r);
  }
  function applySuggestion(s: any) {
    setDraft({ ...s, steps: s.steps.map((st: any) => ({ ...st, required: st.required ?? true })) });
    setEditing('new');
  }
  function addStep() {
    setDraft({ ...draft, steps: [...draft.steps, { title: '', required: true }] });
  }
  function removeStep(idx: number) {
    setDraft({ ...draft, steps: draft.steps.filter((_: any, i: number) => i !== idx) });
  }
  function moveStep(idx: number, dir: -1 | 1) {
    const next = [...draft.steps];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setDraft({ ...draft, steps: next });
  }
  function updateStep(idx: number, patch: any) {
    const next = [...draft.steps];
    next[idx] = { ...next[idx], ...patch };
    setDraft({ ...draft, steps: next });
  }

  async function save() {
    try {
      const payload = {
        name: draft.name,
        category: draft.category,
        description: draft.description,
        steps: draft.steps.map((s: any, i: number) => ({
          title: s.title,
          details: s.details,
          estimatedMin: s.estimatedMin ? Number(s.estimatedMin) : undefined,
          required: s.required ?? true,
          position: i,
        })),
      };
      if (editing === 'new') await api.post('/runbooks', payload);
      else await api.patch('/runbooks/' + editing.id, payload);
      toast.success('Runbook enregistre');
      setEditing(null);
      load();
    } catch (err: any) { toast.error(err.message); }
  }
  async function remove(id: string) {
    if (!confirm('Supprimer ce runbook ?')) return;
    try { await api.delete('/runbooks/' + id); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><ListChecks size={28} /> Runbooks / Procedures</h1>
        <p className="text-sm text-slate-500 mt-1">
          Catalogue de procedures reutilisables (onboarding, audit trimestriel, patch management...).
          A partir d'un template ici, vous pouvez "demarrer un runbook" sur la fiche d'un client pour suivre une checklist exécutable.
        </p>
      </div>

      {!editing && (
        <div className="card p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Catalogue ({items.length})</h2>
            <button onClick={openNew} className="btn btn-primary"><Plus size={14} className="mr-1" /> Nouveau runbook</button>
          </div>
          {items.length === 0 ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-slate-500">Aucun runbook. Demarrez avec une suggestion :</p>
              <div className="grid grid-cols-2 gap-2">
                {suggestions.map((s: any) => (
                  <button key={s.name} onClick={() => applySuggestion(s)} className="text-left border border-slate-200 dark:border-slate-700 rounded p-3 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <div className="font-medium flex items-center gap-2"><Wand2 size={12} className="text-amber-500" />{s.name}</div>
                    <div className="text-xs text-slate-500">{s.description}</div>
                    <div className="text-xs text-slate-400 mt-1">{s.steps.length} etapes - {CATEGORY_LABEL[s.category]}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((r: any) => (
                <div key={r.id} className="border border-slate-200 dark:border-slate-700 rounded p-3 flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium">{r.name}</div>
                    {r.description && <div className="text-xs text-slate-500">{r.description}</div>}
                    <div className="text-xs text-slate-400 mt-1">
                      <span className="badge bg-slate-100 text-slate-600 mr-2">{CATEGORY_LABEL[r.category]}</span>
                      {r.steps.length} etapes - {r._count.runs} executions
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(r)} className="text-mdo-600 hover:text-mdo-700"><Edit size={14} /></button>
                    <button onClick={() => remove(r.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="card p-6 space-y-4">
          <h2 className="font-semibold">{editing === 'new' ? 'Nouveau runbook' : 'Modifier ' + draft.name}</h2>
          <div className="grid grid-cols-2 gap-3">
            <input className="input" placeholder="Nom" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <select className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            <input className="input col-span-2" placeholder="Description" value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-sm">Etapes ({draft.steps.length})</h3>
            {draft.steps.map((s: any, idx: number) => (
              <div key={idx} className="border border-slate-200 dark:border-slate-700 rounded p-2 bg-slate-50 dark:bg-slate-900 space-y-1">
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-slate-400 w-6">{idx + 1}.</span>
                  <input className="input text-xs flex-1" placeholder="Titre de l'etape" value={s.title} onChange={(e) => updateStep(idx, { title: e.target.value })} />
                  <input className="input text-xs w-20" placeholder="min" value={s.estimatedMin ?? ''} onChange={(e) => updateStep(idx, { estimatedMin: e.target.value })} />
                  <label className="text-xs flex items-center gap-1">
                    <input type="checkbox" checked={s.required ?? true} onChange={(e) => updateStep(idx, { required: e.target.checked })} /> Req.
                  </label>
                  <button onClick={() => moveStep(idx, -1)} className="text-slate-500 hover:text-slate-700"><ArrowUp size={12} /></button>
                  <button onClick={() => moveStep(idx, 1)} className="text-slate-500 hover:text-slate-700"><ArrowDown size={12} /></button>
                  <button onClick={() => removeStep(idx)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                </div>
                <textarea className="input text-xs ml-8" rows={2} placeholder="Details (markdown - explications, lien, snippet...)" value={s.details ?? ''} onChange={(e) => updateStep(idx, { details: e.target.value })} />
              </div>
            ))}
            <button onClick={addStep} className="btn btn-secondary text-xs"><Plus size={12} className="mr-1" /> Ajouter une etape</button>
          </div>
          <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <button onClick={save} className="btn btn-primary"><Save size={14} className="mr-1" /> Enregistrer</button>
            <button onClick={() => setEditing(null)} className="btn btn-secondary">Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
