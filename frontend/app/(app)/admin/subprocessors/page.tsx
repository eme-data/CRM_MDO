'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, Plus, Edit, Trash2, X, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useReloadOnFocus } from '@/lib/useReloadOnFocus';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatDate } from '@/lib/utils';

interface Subprocessor {
  id: string;
  name: string;
  legalEntity: string | null;
  role: string;
  purpose: string;
  dataCategories: string[];
  hostingCountry: string | null;
  headquarters: string | null;
  transfersOutsideEu: boolean;
  transferMechanism: string;
  dpaUrl: string | null;
  dpaSignedAt: string | null;
  vendorSubprocessorListUrl: string | null;
  startedAt: string;
  endedAt: string | null;
  isActive: boolean;
  notes: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  HOSTING: 'Hebergement',
  EMAIL: 'Email',
  BACKUP: 'Sauvegarde',
  EDR: 'EDR / Antivirus',
  AI: 'Intelligence artificielle',
  PAYMENT: 'Paiement / facturation',
  COMMUNICATION: 'Communication / VoIP',
  SIGNATURE: 'Signature electronique',
  MONITORING: 'Monitoring / observabilite',
  OTHER: 'Autre',
};

const MECHANISM_LABEL: Record<string, string> = {
  ADEQUACY_DECISION: 'Decision adequation',
  SCC: 'SCC (clauses contractuelles types)',
  BCR: 'BCR (regles contraignantes)',
  DEROGATION: 'Derogation specifique',
  NOT_APPLICABLE: 'N/A (donnees UE)',
};

export default function SubprocessorsPage() {
  const [items, setItems] = useState<Subprocessor[]>([]);
  const [editing, setEditing] = useState<Subprocessor | 'new' | null>(null);
  const confirm = useConfirm();

  async function load() { setItems(await api.get('/subprocessors?includeInactive=true')); }
  useEffect(() => { load(); }, []);
  useReloadOnFocus(load);

  async function remove(s: Subprocessor) {
    const ok = await confirm({ title: 'Supprimer "' + s.name + '" ?', confirmLabel: 'Supprimer', tone: 'danger' });
    if (!ok) return;
    try { await api.delete('/subprocessors/' + s.id); toast.success('Supprime'); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  // Group by role
  const grouped = new Map<string, Subprocessor[]>();
  for (const s of items) {
    if (!grouped.has(s.role)) grouped.set(s.role, []);
    grouped.get(s.role)!.push(s);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <ShieldCheck size={28} className="text-mdo-600" /> Sous-traitants RGPD (DPA — article 28)
        </h1>
        <button onClick={() => setEditing('new')} className="btn btn-primary"><Plus size={16} className="mr-1" /> Nouveau</button>
      </div>

      <div className="card p-4 bg-mdo-50 border-mdo-200 text-sm">
        <p>
          En tant que sous-traitant, MDO Services doit fournir au client (responsable
          de traitement) la liste de ses propres sous-traitants. Cette page sert de
          registre. A communiquer dans chaque DPA signe avec le client.
        </p>
      </div>

      {editing === 'new' && <Form onSave={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}

      {Array.from(grouped.entries()).map(([role, subs]) => (
        <div key={role} className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-700">{ROLE_LABEL[role] ?? role}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {subs.map((s) => (
              <div key={s.id} className={'card p-4 ' + (s.isActive ? '' : 'opacity-50')}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{s.name}</h3>
                      {s.transfersOutsideEu && <span className="badge bg-amber-100 text-amber-700">Hors UE</span>}
                      {!s.isActive && <span className="badge bg-red-100 text-red-700">Inactif</span>}
                    </div>
                    {s.legalEntity && <p className="text-xs text-slate-500">{s.legalEntity}</p>}
                    <p className="text-sm mt-1">{s.purpose}</p>
                    <div className="text-xs text-slate-600 mt-2 space-y-0.5">
                      {s.hostingCountry && <div><strong>Hebergement :</strong> {s.hostingCountry}</div>}
                      <div><strong>Donnees :</strong> {s.dataCategories.join(', ') || '—'}</div>
                      <div><strong>Mecanisme transfert :</strong> {MECHANISM_LABEL[s.transferMechanism]}</div>
                      {s.dpaUrl && (
                        <div><strong>DPA :</strong> <a href={s.dpaUrl} target="_blank" rel="noreferrer" className="text-mdo-600 hover:underline inline-flex items-center gap-1">Voir <ExternalLink size={10} /></a> {s.dpaSignedAt && '— signe ' + formatDate(s.dpaSignedAt)}</div>
                      )}
                      {s.vendorSubprocessorListUrl && (
                        <div><strong>Liste vendor :</strong> <a href={s.vendorSubprocessorListUrl} target="_blank" rel="noreferrer" className="text-mdo-600 hover:underline inline-flex items-center gap-1">Voir <ExternalLink size={10} /></a></div>
                      )}
                    </div>
                    {s.notes && <p className="text-xs italic text-slate-500 mt-2">{s.notes}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(s)} className="text-slate-500 hover:text-mdo-600"><Edit size={14} /></button>
                    <button onClick={() => remove(s)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                  </div>
                </div>
                {editing && typeof editing !== 'string' && editing.id === s.id && (
                  <div className="mt-4 pt-4 border-t">
                    <Form sub={s} onSave={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Form({ sub, onSave, onCancel }: { sub?: Subprocessor; onSave: () => void; onCancel: () => void }) {
  const [data, setData] = useState<any>(sub ?? {
    name: '', role: 'OTHER', purpose: '', dataCategories: [],
    hostingCountry: '', transfersOutsideEu: false, transferMechanism: 'NOT_APPLICABLE',
    isActive: true,
  });
  function set(k: string, v: any) { setData((d: any) => ({ ...d, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...data,
      dataCategories: typeof data.dataCategories === 'string'
        ? data.dataCategories.split(',').map((s: string) => s.trim()).filter(Boolean)
        : data.dataCategories,
      dpaSignedAt: data.dpaSignedAt || null,
    };
    try {
      if (sub) await api.patch('/subprocessors/' + sub.id, payload);
      else await api.post('/subprocessors', payload);
      toast.success('Enregistre');
      onSave();
    } catch (err: any) { toast.error(err.message); }
  }

  return (
    <form onSubmit={submit} className="card p-6 space-y-3 border-mdo-200 bg-mdo-50">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{sub ? 'Modifier' : 'Nouveau sous-traitant'}</h3>
        <button type="button" onClick={onCancel} className="text-slate-500"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Nom *</label><input required value={data.name} onChange={(e) => set('name', e.target.value)} className="input" /></div>
        <div><label className="label">Entite legale</label><input value={data.legalEntity ?? ''} onChange={(e) => set('legalEntity', e.target.value)} className="input" /></div>
        <div><label className="label">Role *</label>
          <select required value={data.role} onChange={(e) => set('role', e.target.value)} className="input">
            <option value="HOSTING">Hebergement</option>
            <option value="EMAIL">Email</option>
            <option value="BACKUP">Sauvegarde</option>
            <option value="EDR">EDR / Antivirus</option>
            <option value="AI">IA</option>
            <option value="PAYMENT">Paiement</option>
            <option value="COMMUNICATION">Communication</option>
            <option value="SIGNATURE">Signature</option>
            <option value="MONITORING">Monitoring</option>
            <option value="OTHER">Autre</option>
          </select>
        </div>
        <div><label className="label">Hebergement (pays)</label><input value={data.hostingCountry ?? ''} onChange={(e) => set('hostingCountry', e.target.value)} className="input" placeholder="France, Irlande, USA..." /></div>
      </div>
      <div><label className="label">Purpose / role pour les donnees client *</label>
        <textarea required value={data.purpose} onChange={(e) => set('purpose', e.target.value)} className="input min-h-[60px]" />
      </div>
      <div><label className="label">Categories de donnees (separees par virgule)</label>
        <input value={Array.isArray(data.dataCategories) ? data.dataCategories.join(', ') : data.dataCategories} onChange={(e) => set('dataCategories', e.target.value)} className="input" placeholder="PII, EMAIL_CONTENT, FINANCIAL..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm flex items-center gap-2 mt-6">
          <input type="checkbox" checked={data.transfersOutsideEu} onChange={(e) => set('transfersOutsideEu', e.target.checked)} />
          Transferts hors UE
        </label>
        <div><label className="label">Mecanisme de transfert</label>
          <select value={data.transferMechanism} onChange={(e) => set('transferMechanism', e.target.value)} className="input">
            <option value="NOT_APPLICABLE">N/A (UE)</option>
            <option value="ADEQUACY_DECISION">Decision adequation</option>
            <option value="SCC">SCC</option>
            <option value="BCR">BCR</option>
            <option value="DEROGATION">Derogation</option>
          </select>
        </div>
        <div><label className="label">URL DPA signe</label><input type="url" value={data.dpaUrl ?? ''} onChange={(e) => set('dpaUrl', e.target.value)} className="input" /></div>
        <div><label className="label">Date signature DPA</label><input type="date" value={data.dpaSignedAt ?? ''} onChange={(e) => set('dpaSignedAt', e.target.value)} className="input" /></div>
        <div className="col-span-2"><label className="label">URL liste sous-traitants vendor</label><input type="url" value={data.vendorSubprocessorListUrl ?? ''} onChange={(e) => set('vendorSubprocessorListUrl', e.target.value)} className="input" /></div>
      </div>
      <div><label className="label">Notes</label><textarea value={data.notes ?? ''} onChange={(e) => set('notes', e.target.value)} className="input min-h-[60px]" /></div>
      <label className="text-sm flex items-center gap-2">
        <input type="checkbox" checked={data.isActive ?? true} onChange={(e) => set('isActive', e.target.checked)} />
        Actif
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">{sub ? 'Enregistrer' : 'Creer'}</button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">Annuler</button>
      </div>
    </form>
  );
}
