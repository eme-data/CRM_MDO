'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Workflow, Trash2, Play, Edit2, X, Pause, RefreshCw, History } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatDateTime } from '@/lib/utils';

type Trigger = 'CONTRACT_EXPIRING' | 'TICKET_OVERDUE' | 'ASSET_EXPIRING' | 'INVOICE_OVERDUE';
type Action = 'CREATE_TASK' | 'CREATE_NOTIFICATION';
type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
type TargetRole = 'ADMIN' | 'MANAGER' | 'OWNER';

interface Rule {
  id: string;
  name: string;
  description: string | null;
  trigger: Trigger;
  triggerParams: Record<string, any>;
  action: Action;
  actionParams: Record<string, any>;
  isActive: boolean;
  lastEvaluatedAt: string | null;
  lastFiredAt: string | null;
  firedCount: number;
  assignee: { id: string; firstName: string; lastName: string } | null;
  _count: { executions: number };
}

const TRIGGER_LABEL: Record<Trigger, string> = {
  CONTRACT_EXPIRING: 'Contrat expirant',
  TICKET_OVERDUE: 'Ticket en retard (dueDate depassee)',
  ASSET_EXPIRING: 'Asset expirant (licence/cert/domaine)',
  INVOICE_OVERDUE: 'Facture impayee en retard',
};

const ACTION_LABEL: Record<Action, string> = {
  CREATE_TASK: 'Creer une Task',
  CREATE_NOTIFICATION: 'Envoyer une notification in-app',
};

// Placeholders disponibles dans titleTemplate / title / body selon le trigger.
// Affiches dans la modale pour aider l'utilisateur a construire son template.
const PLACEHOLDERS_BY_TRIGGER: Record<Trigger, string[]> = {
  CONTRACT_EXPIRING: ['{reference}', '{title}', '{endDate}', '{daysRemaining}', '{company.name}'],
  TICKET_OVERDUE: ['{reference}', '{title}', '{priority}', '{dueDate}', '{company.name}'],
  ASSET_EXPIRING: ['{name}', '{type}', '{expiresAt}', '{daysRemaining}', '{company.name}'],
  INVOICE_OVERDUE: ['{number}', '{dueDate}', '{daysOverdue}', '{totalTtc}', '{company.name}'],
};

export default function WorkflowRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [creating, setCreating] = useState(false);
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    try {
      setRules(await api.get('/workflow-rules'));
    } catch (err: any) {
      toast.error(err.message ?? 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function evaluate(r: Rule) {
    try {
      const fired = await api.post('/workflow-rules/' + r.id + '/evaluate');
      toast.success((fired ?? 0) + ' execution(s) tiree(s)');
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Echec');
    }
  }

  async function toggleActive(r: Rule) {
    try {
      await api.patch('/workflow-rules/' + r.id, { isActive: !r.isActive });
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Echec');
    }
  }

  async function reset(r: Rule) {
    const ok = await confirm({
      title: 'Reset les executions ?',
      message: 'Les ' + r._count.executions + ' enregistrements d\'execution seront supprimes. La regle pourra re-tirer sur les memes entites. Les Tasks/notifications deja creees ne sont PAS supprimees.',
      confirmLabel: 'Reset',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      const r2 = await api.post('/workflow-rules/' + r.id + '/reset-executions');
      toast.success(r2.deleted + ' executions supprimees');
      load();
    } catch (err: any) {
      toast.error(err.message ?? 'Echec');
    }
  }

  async function handleDelete(r: Rule) {
    const ok = await confirm({
      title: 'Supprimer cette regle ?',
      message: `« ${r.name} » sera supprimee ainsi que son historique d'executions (Tasks/notifications creees sont preservees).`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete('/workflow-rules/' + r.id);
      toast.success('Regle supprimee');
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
            <Workflow size={28} /> Regles workflow
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Automatisations "quand X alors Y" evaluees quotidiennement. Codifient les reflexes ops
            (alertes contrats expirant, suivi tickets overdue, etc.) pour ne plus dependre de la memoire.
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-primary">
          <Plus size={16} className="mr-1" /> Nouvelle regle
        </button>
      </div>

      {loading ? (
        <div className="card p-6 animate-pulse h-32" />
      ) : rules.length === 0 ? (
        <div className="card p-12 text-center text-slate-500">
          <Workflow size={48} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Aucune regle workflow</p>
          <p className="text-sm mt-1">
            Exemple typique : "Contrats expirant dans 60j" {'->'} "Creer une Task assignee a l'owner".
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase">
              <tr>
                <th className="p-3 font-medium">Nom</th>
                <th className="p-3 font-medium">Trigger</th>
                <th className="p-3 font-medium">Action</th>
                <th className="p-3 font-medium">Tirees</th>
                <th className="p-3 font-medium">Derniere</th>
                <th className="p-3 font-medium">Etat</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className={'border-t ' + (!r.isActive ? 'opacity-60' : '')}>
                  <td className="p-3">
                    <p className="font-medium">{r.name}</p>
                    {r.description && <p className="text-xs text-slate-500 truncate max-w-[280px]">{r.description}</p>}
                  </td>
                  <td className="p-3 text-sm">
                    {TRIGGER_LABEL[r.trigger]}
                    <span className="text-xs text-slate-400 block">{summarizeTriggerParams(r)}</span>
                  </td>
                  <td className="p-3 text-sm">
                    {ACTION_LABEL[r.action]}
                    <span className="text-xs text-slate-400 block">{summarizeActionParams(r)}</span>
                  </td>
                  <td className="p-3 text-sm tabular-nums">
                    <span className="font-medium">{r.firedCount}</span>
                    <span className="text-xs text-slate-400 block">{r._count.executions} entites</span>
                  </td>
                  <td className="p-3 text-xs text-slate-500">
                    {r.lastFiredAt ? formatDateTime(r.lastFiredAt) : '—'}
                  </td>
                  <td className="p-3">
                    {r.isActive ? (
                      <span className="badge bg-emerald-100 text-emerald-700">Active</span>
                    ) : (
                      <span className="badge bg-slate-100 text-slate-500">Pause</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => evaluate(r)} className="p-1.5 text-slate-500 hover:text-mdo-600" title="Evaluer maintenant"><Play size={14} /></button>
                      <button onClick={() => toggleActive(r)} className="p-1.5 text-slate-500 hover:text-mdo-600" title={r.isActive ? 'Mettre en pause' : 'Activer'}>{r.isActive ? <Pause size={14} /> : <RefreshCw size={14} />}</button>
                      <button onClick={() => reset(r)} className="p-1.5 text-slate-500 hover:text-amber-600" title="Reset executions (re-tire sur les memes entites)"><History size={14} /></button>
                      <button onClick={() => setEditing(r)} className="p-1.5 text-slate-500 hover:text-mdo-600" title="Modifier"><Edit2 size={14} /></button>
                      <button onClick={() => handleDelete(r)} className="p-1.5 text-slate-500 hover:text-red-600" title="Supprimer"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <RuleModal
          rule={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function summarizeTriggerParams(r: Rule): string {
  if (r.trigger === 'CONTRACT_EXPIRING' || r.trigger === 'ASSET_EXPIRING') {
    return r.triggerParams.daysBefore + ' jours avant';
  }
  if (r.trigger === 'INVOICE_OVERDUE') return r.triggerParams.daysOverdue + ' jours de retard';
  return '';
}

function summarizeActionParams(r: Rule): string {
  if (r.action === 'CREATE_TASK') {
    return `« ${String(r.actionParams.titleTemplate ?? '').slice(0, 40)} » (${r.actionParams.priority ?? 'NORMAL'})`;
  }
  if (r.action === 'CREATE_NOTIFICATION') {
    return `« ${String(r.actionParams.title ?? '').slice(0, 40)} » -> ${r.actionParams.targetRole ?? 'ADMIN'}`;
  }
  return '';
}

function RuleModal({ rule, onClose, onSaved }: { rule: Rule | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!rule;
  const [form, setForm] = useState({
    name: rule?.name ?? '',
    description: rule?.description ?? '',
    trigger: (rule?.trigger ?? 'CONTRACT_EXPIRING') as Trigger,
    daysBefore: String(rule?.triggerParams?.daysBefore ?? 60),
    daysOverdue: String(rule?.triggerParams?.daysOverdue ?? 7),
    action: (rule?.action ?? 'CREATE_TASK') as Action,
    titleTemplate: String(rule?.actionParams?.titleTemplate ?? ''),
    priority: (rule?.actionParams?.priority ?? 'NORMAL') as Priority,
    dueDateOffsetDays: String(rule?.actionParams?.dueDateOffsetDays ?? 7),
    notifTitle: String(rule?.actionParams?.title ?? ''),
    notifBody: String(rule?.actionParams?.body ?? ''),
    targetRole: (rule?.actionParams?.targetRole ?? 'ADMIN') as TargetRole,
    assigneeId: rule?.assignee?.id ?? '',
  });
  const [users, setUsers] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/users').then((r) => setUsers(r ?? [])).catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const triggerParams: Record<string, any> =
        form.trigger === 'CONTRACT_EXPIRING' || form.trigger === 'ASSET_EXPIRING'
          ? { daysBefore: Number(form.daysBefore) }
          : form.trigger === 'INVOICE_OVERDUE'
            ? { daysOverdue: Number(form.daysOverdue) }
            : {};
      const actionParams: Record<string, any> =
        form.action === 'CREATE_TASK'
          ? {
              titleTemplate: form.titleTemplate.trim(),
              priority: form.priority,
              dueDateOffsetDays: Number(form.dueDateOffsetDays),
            }
          : {
              title: form.notifTitle.trim(),
              body: form.notifBody.trim() || undefined,
              targetRole: form.targetRole,
            };
      const payload: any = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        trigger: form.trigger,
        triggerParams,
        action: form.action,
        actionParams,
        assigneeId: form.assigneeId || undefined,
      };
      if (isEdit) {
        await api.patch('/workflow-rules/' + rule!.id, payload);
        toast.success('Regle mise a jour');
      } else {
        await api.post('/workflow-rules', payload);
        toast.success('Regle creee');
      }
      onSaved();
    } catch (err: any) {
      toast.error(err.message ?? 'Echec enregistrement');
    } finally {
      setSaving(false);
    }
  }

  const placeholders = PLACEHOLDERS_BY_TRIGGER[form.trigger];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="card max-w-2xl w-full p-6 my-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{isEdit ? 'Modifier la regle' : 'Nouvelle regle workflow'}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div>
          <label className="label">Nom *</label>
          <input required className="input" placeholder='ex: "Alerte contrats expirant 60j"' value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>

        <div>
          <label className="label">Description (optionnelle)</label>
          <textarea className="input min-h-[60px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Trigger</label>
            <select className="input" value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value as Trigger })}>
              {Object.entries(TRIGGER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Action</label>
            <select className="input" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as Action })}>
              {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        {/* Params trigger */}
        {(form.trigger === 'CONTRACT_EXPIRING' || form.trigger === 'ASSET_EXPIRING') && (
          <div>
            <label className="label">Jours avant expiration</label>
            <input type="number" min={1} max={365} className="input max-w-[140px]" value={form.daysBefore} onChange={(e) => setForm({ ...form, daysBefore: e.target.value })} />
          </div>
        )}
        {form.trigger === 'INVOICE_OVERDUE' && (
          <div>
            <label className="label">Jours de retard</label>
            <input type="number" min={0} max={365} className="input max-w-[140px]" value={form.daysOverdue} onChange={(e) => setForm({ ...form, daysOverdue: e.target.value })} />
          </div>
        )}

        {/* Placeholders disponibles */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded p-3 text-xs">
          <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Placeholders disponibles dans les templates :</p>
          <div className="flex flex-wrap gap-1">
            {placeholders.map((p) => (
              <code key={p} className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-mdo-600">{p}</code>
            ))}
          </div>
        </div>

        {/* Params action */}
        {form.action === 'CREATE_TASK' && (
          <>
            <div>
              <label className="label">Titre de la Task (template)</label>
              <input
                required
                className="input"
                placeholder='ex: "Preparer renouvellement {reference}"'
                value={form.titleTemplate}
                onChange={(e) => setForm({ ...form, titleTemplate: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Priorite</label>
                <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
                  <option value="LOW">Basse</option>
                  <option value="NORMAL">Normale</option>
                  <option value="HIGH">Haute</option>
                  <option value="URGENT">Urgente</option>
                </select>
              </div>
              <div>
                <label className="label">Echeance (jours)</label>
                <input type="number" min={0} max={365} className="input" value={form.dueDateOffsetDays} onChange={(e) => setForm({ ...form, dueDateOffsetDays: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Assigne par defaut (optionnel)</label>
              <select className="input" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
                <option value="">— Owner de la societe si dispo, sinon non assigne —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
            </div>
          </>
        )}
        {form.action === 'CREATE_NOTIFICATION' && (
          <>
            <div>
              <label className="label">Titre de la notification (template)</label>
              <input required className="input" placeholder='ex: "Contrat {reference} expire dans {daysRemaining} jours"' value={form.notifTitle} onChange={(e) => setForm({ ...form, notifTitle: e.target.value })} />
            </div>
            <div>
              <label className="label">Corps (optionnel, template)</label>
              <textarea className="input min-h-[60px]" placeholder="Detail additionnel..." value={form.notifBody} onChange={(e) => setForm({ ...form, notifBody: e.target.value })} />
            </div>
            <div>
              <label className="label">Destinataires</label>
              <select className="input" value={form.targetRole} onChange={(e) => setForm({ ...form, targetRole: e.target.value as TargetRole })}>
                <option value="ADMIN">Tous les ADMIN</option>
                <option value="MANAGER">Tous les MANAGER</option>
                <option value="OWNER">Owner de la societe (sinon personne)</option>
              </select>
            </div>
          </>
        )}

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
