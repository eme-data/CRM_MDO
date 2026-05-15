'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, Plus, Trash2, Edit, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmDialog';

interface Step { dayOffset: number; subject: string; bodyHtml: string }
interface Campaign {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  isActive: boolean;
  steps: Array<Step & { id: string; position: number }>;
  _count: { enrollments: number };
}

export default function DripPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null);
  const confirm = useConfirm();

  async function load() { setItems(await api.get('/drip/campaigns?includeInactive=true')); }
  useEffect(() => { load(); }, []);

  async function remove(c: Campaign) {
    const ok = await confirm({ title: 'Supprimer "' + c.name + '" ?', message: 'Tous les enrollments associes seront aussi supprimes.', confirmLabel: 'Supprimer', tone: 'danger' });
    if (!ok) return;
    try { await api.delete('/drip/campaigns/' + c.id); toast.success('Supprime'); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Mail size={28} className="text-mdo-600" /> Drip campaigns (sequences emails)
        </h1>
        <button onClick={() => setEditing('new')} className="btn btn-primary"><Plus size={16} className="mr-1" /> Nouvelle</button>
      </div>

      <p className="text-sm text-slate-500">
        Cron quotidien 10h00 envoie les emails dont le dayOffset matche la date d'enrollement.
        Placeholders supportes : <code>{'{firstName}'}</code>, <code>{'{lastName}'}</code>, <code>{'{companyName}'}</code>, <code>{'{email}'}</code>.
      </p>

      {editing === 'new' && <CampaignForm onSave={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}

      <div className="space-y-3">
        {items.map((c) => (
          <div key={c.id} className={'card p-4 ' + (c.isActive ? '' : 'opacity-50')}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{c.name}</h3>
                  <span className="badge bg-slate-100 text-slate-700">{c.trigger}</span>
                  {!c.isActive && <span className="badge bg-red-100 text-red-700">Inactif</span>}
                </div>
                {c.description && <p className="text-sm text-slate-500 mt-1">{c.description}</p>}
                <p className="text-xs text-slate-400 mt-1">{c.steps.length} etape(s) · {c._count.enrollments} enrollement(s)</p>
                <ol className="mt-2 space-y-0.5 text-xs text-slate-600">
                  {c.steps.map((s) => <li key={s.id}><strong>J+{s.dayOffset}</strong> — {s.subject}</li>)}
                </ol>
              </div>
              <div className="flex gap-2">
                <Link href={'/admin/drip/' + c.id + '/enrollments'} className="text-mdo-600 text-xs hover:underline">Enrollments</Link>
                <button onClick={() => setEditing(c)} className="text-slate-500 hover:text-mdo-600"><Edit size={14} /></button>
                <button onClick={() => remove(c)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
              </div>
            </div>
            {editing && typeof editing !== 'string' && editing.id === c.id && (
              <div className="mt-4 pt-4 border-t">
                <CampaignForm campaign={c} onSave={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-slate-400">Aucune sequence. Creez-en une pour automatiser le nurturing leads.</p>}
      </div>
    </div>
  );
}

function CampaignForm({ campaign, onSave, onCancel }: { campaign?: Campaign; onSave: () => void; onCancel: () => void }) {
  const [name, setName] = useState(campaign?.name ?? '');
  const [description, setDescription] = useState(campaign?.description ?? '');
  const [trigger, setTrigger] = useState(campaign?.trigger ?? 'MANUAL');
  const [isActive, setIsActive] = useState(campaign?.isActive ?? true);
  const [steps, setSteps] = useState<Step[]>(campaign?.steps ?? [{ dayOffset: 0, subject: '', bodyHtml: '' }]);

  function setStep(i: number, k: keyof Step, v: any) {
    setSteps((arr) => arr.map((s, idx) => idx === i ? { ...s, [k]: v } : s));
  }
  function addStep() { setSteps((arr) => [...arr, { dayOffset: arr[arr.length - 1]?.dayOffset + 3 || 0, subject: '', bodyHtml: '' }]); }
  function removeStep(i: number) { setSteps((arr) => arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (steps.some((s) => !s.subject || !s.bodyHtml)) { toast.error('Subject et bodyHtml requis sur chaque etape'); return; }
    const payload = {
      name, description: description || undefined, trigger, isActive,
      steps: steps.map((s) => ({ dayOffset: Number(s.dayOffset), subject: s.subject, bodyHtml: s.bodyHtml })),
    };
    try {
      if (campaign) await api.patch('/drip/campaigns/' + campaign.id, payload);
      else await api.post('/drip/campaigns', payload);
      toast.success('Campagne enregistree');
      onSave();
    } catch (err: any) { toast.error(err.message); }
  }

  return (
    <form onSubmit={submit} className="card p-6 space-y-4 border-mdo-200 bg-mdo-50">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{campaign ? 'Modifier la campagne' : 'Nouvelle campagne'}</h2>
        <button type="button" onClick={onCancel} className="text-slate-500"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Nom *</label><input required value={name} onChange={(e) => setName(e.target.value)} className="input" /></div>
        <div><label className="label">Trigger</label>
          <select value={trigger} onChange={(e) => setTrigger(e.target.value)} className="input">
            <option value="MANUAL">Manuel (enrollement explicite)</option>
            <option value="COMPANY_CREATED_AS_LEAD">Auto sur creation Lead</option>
          </select>
        </div>
      </div>
      <div><label className="label">Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} className="input" /></div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Etapes</label>
          <button type="button" onClick={addStep} className="btn btn-secondary text-xs"><Plus size={12} className="mr-1" /> Etape</button>
        </div>
        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="border rounded-md p-3 bg-white space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Step {i + 1}</span>
                <label className="text-xs">J+</label>
                <input type="number" min={0} className="input max-w-[60px] text-xs" value={s.dayOffset} onChange={(e) => setStep(i, 'dayOffset', parseInt(e.target.value))} />
                <input className="input flex-1" placeholder="Subject" value={s.subject} onChange={(e) => setStep(i, 'subject', e.target.value)} />
                <button type="button" onClick={() => removeStep(i)} className="text-red-500"><Trash2 size={14} /></button>
              </div>
              <textarea className="input min-h-[100px] font-mono text-xs" placeholder="<p>Bonjour {firstName},</p>..." value={s.bodyHtml} onChange={(e) => setStep(i, 'bodyHtml', e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      <label className="text-sm flex items-center gap-2">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Actif
      </label>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">{campaign ? 'Enregistrer' : 'Creer'}</button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">Annuler</button>
      </div>
    </form>
  );
}
