'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, RefreshCw, Trash2, Play, Repeat, Edit2, X, Pause } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatDate } from '@/lib/utils';

type Frequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

interface Template {
  id: string;
  name: string;
  title: string;
  description: string | null;
  priority: Priority;
  dueDateOffsetDays: number;
  frequency: Frequency;
  dayOfMonth: number | null;
  startsOn: string;
  endsOn: string | null;
  nextRunAt: string;
  lastRunAt: string | null;
  generatedCount: number;
  isActive: boolean;
  companyId: string | null;
  assigneeId: string | null;
  contractId: string | null;
  company: { id: string; name: string } | null;
  assignee: { id: string; firstName: string; lastName: string } | null;
  contract: { id: string; reference: string } | null;
  _count: { tasks: number };
}

const FREQUENCY_LABEL: Record<Frequency, string> = {
  WEEKLY: 'Hebdomadaire',
  MONTHLY: 'Mensuel',
  QUARTERLY: 'Trimestriel',
  YEARLY: 'Annuel',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Basse',
  NORMAL: 'Normale',
  HIGH: 'Haute',
  URGENT: 'Urgente',
};

const PRIORITY_COLOR: Record<Priority, string> = {
  LOW: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  NORMAL: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  HIGH: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  URGENT: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};

export default function RecurringTasksPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    try {
      const t = await api.get('/recurring-tasks');
      setTemplates(t);
    } catch (err: any) {
      toast.error(err.message ?? 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function handleRunNow(t: Template) {
    try {
      await api.post('/recurring-tasks/' + t.id + '/run-now');
      toast.success('Tache generee — la prochaine echeance est recalculee');
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Echec');
    }
  }

  async function handleToggleActive(t: Template) {
    try {
      await api.patch('/recurring-tasks/' + t.id, { isActive: !t.isActive });
      toast.success(t.isActive ? 'Modele desactive' : 'Modele active');
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Echec');
    }
  }

  async function handleDelete(t: Template) {
    const ok = await confirm({
      title: 'Supprimer ce modele ?',
      message: `« ${t.name} » sera supprime. Les Tasks deja generees seront preservees mais perdront le lien vers le modele.`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete('/recurring-tasks/' + t.id);
      toast.success('Modele supprime');
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Echec');
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Repeat size={28} /> Taches recurrentes
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Modeles qui generent automatiquement une Task selon une frequence definie.
            Utile pour les checks reguliers (backups, patches, revues trimestrielles, etc.).
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary">
          <Plus size={16} className="mr-1" /> Nouveau modele
        </button>
      </div>

      {loading ? (
        <div className="card p-6 animate-pulse h-32" />
      ) : templates.length === 0 ? (
        <div className="card p-12 text-center text-slate-500">
          <Repeat size={48} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Aucun modele recurrent</p>
          <p className="text-sm mt-1">Cree un modele pour automatiser les taches qui reviennent regulierement.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase">
              <tr>
                <th className="p-3 font-medium">Modele</th>
                <th className="p-3 font-medium">Frequence</th>
                <th className="p-3 font-medium">Client / Contrat</th>
                <th className="p-3 font-medium">Prochaine</th>
                <th className="p-3 font-medium">Generees</th>
                <th className="p-3 font-medium">Etat</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className={'border-t ' + (!t.isActive ? 'opacity-60' : '')}>
                  <td className="p-3">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-slate-500 truncate max-w-[280px]" title={t.title}>{t.title}</p>
                    <span className={'inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium ' + PRIORITY_COLOR[t.priority]}>
                      {PRIORITY_LABEL[t.priority]}
                    </span>
                  </td>
                  <td className="p-3 text-sm">
                    {FREQUENCY_LABEL[t.frequency]}
                    {t.dayOfMonth && t.frequency !== 'WEEKLY' && (
                      <span className="text-slate-400 text-xs block">le {t.dayOfMonth} du mois</span>
                    )}
                  </td>
                  <td className="p-3 text-sm">
                    {t.company ? (
                      <Link href={'/companies/' + t.company.id} className="text-mdo-600 hover:underline">{t.company.name}</Link>
                    ) : (
                      <span className="text-slate-400">Global</span>
                    )}
                    {t.contract && (
                      <span className="text-xs text-slate-500 block">{t.contract.reference}</span>
                    )}
                  </td>
                  <td className="p-3 text-sm">
                    {t.isActive ? formatDate(t.nextRunAt) : <span className="text-slate-400">—</span>}
                    {t.lastRunAt && (
                      <span className="text-xs text-slate-400 block">derniere : {formatDate(t.lastRunAt)}</span>
                    )}
                  </td>
                  <td className="p-3 text-sm tabular-nums">{t.generatedCount}</td>
                  <td className="p-3">
                    {t.isActive ? (
                      <span className="badge bg-emerald-100 text-emerald-700">Actif</span>
                    ) : (
                      <span className="badge bg-slate-100 text-slate-500">Pause</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => handleRunNow(t)} className="p-1.5 text-slate-500 hover:text-mdo-600" title="Generer maintenant">
                        <Play size={14} />
                      </button>
                      <button onClick={() => handleToggleActive(t)} className="p-1.5 text-slate-500 hover:text-mdo-600" title={t.isActive ? 'Mettre en pause' : 'Activer'}>
                        {t.isActive ? <Pause size={14} /> : <RefreshCw size={14} />}
                      </button>
                      <button onClick={() => setEditing(t)} className="p-1.5 text-slate-500 hover:text-mdo-600" title="Modifier">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(t)} className="p-1.5 text-slate-500 hover:text-red-600" title="Supprimer">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <TemplateModal
          template={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function TemplateModal({ template, onClose, onSaved }: { template: Template | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!template;
  const [form, setForm] = useState({
    name: template?.name ?? '',
    title: template?.title ?? '',
    description: template?.description ?? '',
    priority: template?.priority ?? ('NORMAL' as Priority),
    frequency: template?.frequency ?? ('MONTHLY' as Frequency),
    dayOfMonth: template?.dayOfMonth?.toString() ?? '',
    dueDateOffsetDays: template?.dueDateOffsetDays ?? 7,
    startsOn: template?.startsOn?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    endsOn: template?.endsOn?.slice(0, 10) ?? '',
    companyId: template?.companyId ?? '',
    assigneeId: template?.assigneeId ?? '',
  });
  const [users, setUsers] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/users').then((r) => setUsers(r ?? [])).catch(() => {});
    // Pour le picker, charger 200 companies suffit (admin sait quoi chercher)
    api.get('/companies?pageSize=200').then((r) => setCompanies(r.items ?? [])).catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        frequency: form.frequency,
        dueDateOffsetDays: Number(form.dueDateOffsetDays),
      };
      if (form.dayOfMonth) payload.dayOfMonth = Number(form.dayOfMonth);
      if (form.startsOn) payload.startsOn = new Date(form.startsOn).toISOString();
      if (form.endsOn) payload.endsOn = new Date(form.endsOn).toISOString();
      if (form.companyId) payload.companyId = form.companyId;
      if (form.assigneeId) payload.assigneeId = form.assigneeId;

      if (isEdit) {
        await api.patch('/recurring-tasks/' + template!.id, payload);
        toast.success('Modele mis a jour');
      } else {
        await api.post('/recurring-tasks', payload);
        toast.success('Modele cree');
      }
      onSaved();
    } catch (err: any) {
      toast.error(err.message ?? 'Echec enregistrement');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="card max-w-2xl w-full p-6 my-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isEdit ? 'Modifier le modele' : 'Nouveau modele recurrent'}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div>
          <label className="label">Nom du modele *</label>
          <input required className="input" placeholder='ex: "Check backup mensuel"' value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>

        <div>
          <label className="label">Titre de la Task generee *</label>
          <input required className="input" placeholder='ex: "Verifier les backups Veeam"' value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <p className="text-xs text-slate-500 mt-1">Apparait dans la liste Tasks. Peut etre identique au nom du modele.</p>
        </div>

        <div>
          <label className="label">Description (optionnelle)</label>
          <textarea className="input min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Priorite</label>
            <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Frequence</label>
            <select className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Frequency })}>
              {Object.entries(FREQUENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        {form.frequency !== 'WEEKLY' && (
          <div>
            <label className="label">Jour du mois (1-28, optionnel)</label>
            <input type="number" min={1} max={28} className="input max-w-[120px]" value={form.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })} placeholder="Auto" />
            <p className="text-xs text-slate-500 mt-1">Si vide, on prend le jour de "Demarrage" comme reference. Limite a 28 pour eviter les soucis de fevrier.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Demarrage</label>
            <input type="date" className="input" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} />
          </div>
          <div>
            <label className="label">Fin (optionnelle)</label>
            <input type="date" className="input" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
          </div>
        </div>

        <div>
          <label className="label">Delai jusqu'a echeance (jours)</label>
          <input type="number" min={1} max={365} className="input max-w-[120px]" value={form.dueDateOffsetDays} onChange={(e) => setForm({ ...form, dueDateOffsetDays: Number(e.target.value) })} />
          <p className="text-xs text-slate-500 mt-1">Ecart entre la creation de la Task et sa dueDate. Defaut 7 j.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Societe (optionnelle — sinon global)</label>
            <select className="input" value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
              <option value="">— Aucune (global) —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Assigne (optionnel)</label>
            <select className="input" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">— Personne —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn btn-secondary">Annuler</button>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? 'Enregistrement...' : (isEdit ? 'Enregistrer' : 'Creer')}
          </button>
        </div>
      </form>
    </div>
  );
}
