'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2, Edit, ListChecks, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmDialog';

interface Step {
  title: string;
  description?: string;
  dueDateOffsetDays: number;
  assigneeRole?: string | null;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  offer: string | null;
  isActive: boolean;
  steps: Array<Step & { id: string; position: number }>;
  _count: { steps: number; runs: number };
}

const OFFERS = [
  { value: '', label: 'Toutes offres (global)' },
  { value: 'MDO_ESSENTIEL', label: 'MDO Essentiel' },
  { value: 'MDO_PRO', label: 'MDO Pro' },
  { value: 'MDO_SOUVERAIN', label: 'MDO Souverain' },
  { value: 'CUSTOM', label: 'Sur mesure' },
];
const ROLES = [
  { value: '', label: '— sans assignation auto —' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'SALES', label: 'Sales' },
];

export default function OnboardingTemplatesPage() {
  const [items, setItems] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const confirm = useConfirm();

  async function load() { setItems(await api.get('/onboarding/templates?includeInactive=true')); }
  useEffect(() => { load(); }, []);

  async function remove(t: Template) {
    const ok = await confirm({ title: 'Supprimer "' + t.name + '" ?', confirmLabel: 'Supprimer', tone: 'danger' });
    if (!ok) return;
    try { await api.delete('/onboarding/templates/' + t.id); toast.success('Supprime'); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <ListChecks size={28} className="text-mdo-600" /> Templates onboarding client
        </h1>
        <button onClick={() => setEditing('new')} className="btn btn-primary"><Plus size={16} className="mr-1" /> Nouveau</button>
      </div>

      <p className="text-sm text-slate-500">
        A la signature d'un nouveau contrat (status passe a ACTIVE), MDO declenche
        automatiquement le template correspondant a l'offre — checklist d'integration
        creee + assignations par role.
      </p>

      {editing === 'new' && <TemplateForm onSave={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}

      <div className="space-y-3">
        {items.map((t) => (
          <div key={t.id} className={'card p-4 ' + (t.isActive ? '' : 'opacity-50')}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{t.name}</h3>
                  {t.offer && <span className="badge bg-mdo-100 text-mdo-700">{OFFERS.find((o) => o.value === t.offer)?.label}</span>}
                  {!t.offer && <span className="badge bg-slate-100 text-slate-700">Global</span>}
                  {!t.isActive && <span className="badge bg-red-100 text-red-700">Inactif</span>}
                </div>
                {t.description && <p className="text-sm text-slate-500 mt-1">{t.description}</p>}
                <p className="text-xs text-slate-400 mt-1">{t._count.steps} etape(s) · {t._count.runs} run(s) total</p>
                <ol className="mt-2 space-y-0.5 text-xs text-slate-600">
                  {t.steps.map((s) => (
                    <li key={s.id}>
                      <strong>J+{s.dueDateOffsetDays}</strong> — {s.title}
                      {s.assigneeRole && <span className="text-slate-400"> ({s.assigneeRole})</span>}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(t)} className="text-slate-500 hover:text-mdo-600"><Edit size={14} /></button>
                <button onClick={() => remove(t)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
              </div>
            </div>
            {editing && typeof editing !== 'string' && editing.id === t.id && (
              <div className="mt-4 pt-4 border-t">
                <TemplateForm template={t} onSave={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-slate-400">Aucun template. Creez-en un pour automatiser l'onboarding des nouveaux clients.</p>}
      </div>
    </div>
  );
}

function TemplateForm({ template, onSave, onCancel }: { template?: Template; onSave: () => void; onCancel: () => void }) {
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [offer, setOffer] = useState(template?.offer ?? '');
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [steps, setSteps] = useState<Step[]>(template?.steps ?? [{ title: '', dueDateOffsetDays: 0 }]);

  function setStep(i: number, k: keyof Step, v: any) {
    setSteps((arr) => arr.map((s, idx) => idx === i ? { ...s, [k]: v } : s));
  }
  function addStep() { setSteps((arr) => [...arr, { title: '', dueDateOffsetDays: arr.length * 3 }]); }
  function removeStep(i: number) { setSteps((arr) => arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (steps.some((s) => !s.title)) { toast.error('Toutes les etapes doivent avoir un titre'); return; }
    const payload = {
      name,
      description: description || undefined,
      offer: offer || null,
      isActive,
      steps: steps.map((s) => ({
        ...s,
        dueDateOffsetDays: Number(s.dueDateOffsetDays),
        assigneeRole: s.assigneeRole || undefined,
      })),
    };
    try {
      if (template) await api.patch('/onboarding/templates/' + template.id, payload);
      else await api.post('/onboarding/templates', payload);
      toast.success('Template enregistre');
      onSave();
    } catch (err: any) { toast.error(err.message); }
  }

  return (
    <form onSubmit={submit} className="card p-6 space-y-4 border-mdo-200 bg-mdo-50">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{template ? 'Modifier le template' : 'Nouveau template'}</h2>
        <button type="button" onClick={onCancel} className="text-slate-500"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Nom *</label><input required value={name} onChange={(e) => setName(e.target.value)} className="input" /></div>
        <div><label className="label">Offre cible</label>
          <select value={offer} onChange={(e) => setOffer(e.target.value)} className="input">
            {OFFERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div><label className="label">Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input min-h-[60px]" /></div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Etapes</label>
          <button type="button" onClick={addStep} className="btn btn-secondary text-xs"><Plus size={12} className="mr-1" /> Etape</button>
        </div>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-start bg-white p-2 rounded border">
              <div className="col-span-1 text-center text-slate-400 pt-2 text-xs">#{i + 1}</div>
              <input className="input col-span-5" placeholder="Titre de l'etape *" value={s.title} onChange={(e) => setStep(i, 'title', e.target.value)} required />
              <input type="number" min={0} className="input col-span-1" placeholder="J+" value={s.dueDateOffsetDays} onChange={(e) => setStep(i, 'dueDateOffsetDays', parseInt(e.target.value))} />
              <select className="input col-span-2" value={s.assigneeRole ?? ''} onChange={(e) => setStep(i, 'assigneeRole', e.target.value)}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <input className="input col-span-2" placeholder="Description (opt.)" value={s.description ?? ''} onChange={(e) => setStep(i, 'description', e.target.value)} />
              <button type="button" onClick={() => removeStep(i)} className="col-span-1 text-red-500 pt-2 flex justify-center"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>

      <label className="text-sm flex items-center gap-2">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Actif (auto-declenche a la signature des contrats)
      </label>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">{template ? 'Enregistrer' : 'Creer'}</button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">Annuler</button>
      </div>
    </form>
  );
}
