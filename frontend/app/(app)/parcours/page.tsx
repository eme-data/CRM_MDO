'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Footprints, Plus, Trash2, ChevronDown, ChevronRight, X, ListChecks } from 'lucide-react';
import { api } from '@/lib/api';
import { me as fetchMe, User } from '@/lib/auth';

interface Task { id: string; label: string; description: string | null; responsible: string | null; dueDate: string | null; done: boolean }
interface Person { id: string; firstName: string; lastName: string }
interface Journey { id: string; kind: string; title: string; startDate: string | null; status: string; employee?: Person; tasks: Task[] }
interface TemplateTask { label: string; description?: string | null; responsible?: string | null; offsetDays?: number | null }
interface Template { id: string; name: string; kind: string; tasks: TemplateTask[]; _count?: { journeys: number } }

const KIND: Record<string, { label: string; cls: string }> = {
  ONBOARDING: { label: 'Arrivee', cls: 'bg-emerald-100 text-emerald-700' },
  OFFBOARDING: { label: 'Depart', cls: 'bg-orange-100 text-orange-700' },
};
const JSTATUS: Record<string, { label: string; cls: string }> = {
  IN_PROGRESS: { label: 'En cours', cls: 'bg-amber-100 text-amber-800' },
  COMPLETED: { label: 'Termine', cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'Annule', cls: 'bg-slate-100 text-slate-500' },
};
function frDate(s: string | null) { return s ? new Date(s).toLocaleDateString('fr-FR') : '-'; }

export default function ParcoursPage() {
  const [user, setUser] = useState<User | null>(null);
  const [mine, setMine] = useState<Journey[]>([]);
  const [managed, setManaged] = useState<Journey[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [employees, setEmployees] = useState<Person[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [showStart, setShowStart] = useState(false);
  const [showTpl, setShowTpl] = useState(false);
  const [form, setForm] = useState({ employeeId: '', kind: 'ONBOARDING', templateId: '', title: '', startDate: '' });

  const isManager = !!user && (user.isSuperAdmin || user.role === 'ADMIN' || user.role === 'MANAGER');

  async function reload() {
    try { setMine(await api.get<Journey[]>('/journeys/mine')); } catch { /* */ }
    if (isManager) {
      try { setManaged(await api.get<Journey[]>('/journeys')); } catch { /* */ }
      try { setTemplates(await api.get<Template[]>('/journeys/templates')); } catch { /* */ }
      try { setEmployees(await api.get<Person[]>('/employees')); } catch { /* */ }
    }
  }
  useEffect(() => { fetchMe().then(setUser).catch(() => {}); }, []);
  useEffect(() => { if (user) reload(); }, [user]);

  const filteredTemplates = templates.filter((t) => t.kind === form.kind);

  async function startJourney() {
    if (!form.employeeId) { toast.error('Choisissez un collaborateur'); return; }
    try {
      await api.post('/journeys', {
        employeeId: form.employeeId, kind: form.kind,
        templateId: form.templateId || undefined, title: form.title || undefined,
        startDate: form.startDate || undefined,
      });
      toast.success('Parcours demarre'); setShowStart(false);
      setForm({ employeeId: '', kind: 'ONBOARDING', templateId: '', title: '', startDate: '' }); reload();
    } catch (err: any) { toast.error(err.message ?? 'Erreur'); }
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <h1 className="text-3xl font-bold flex items-center gap-3"><Footprints size={28} className="text-mdo-600" /> Parcours collaborateur</h1>

      {/* Mes parcours */}
      <section className="space-y-3">
        <h2 className="font-semibold">Mes parcours</h2>
        {mine.length === 0 ? <p className="text-sm text-slate-400">Aucun parcours en cours.</p> : mine.map((j) => (
          <JourneyCard key={j.id} j={j} isManager={false} open={!!open[j.id]}
            toggle={() => setOpen((s) => ({ ...s, [j.id]: !s[j.id] }))} onChange={reload} />
        ))}
      </section>

      {/* Manager : equipe + modeles */}
      {isManager && (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Parcours de l'equipe</h2>
              <div className="flex gap-2">
                <button onClick={() => setShowTpl((v) => !v)} className="btn btn-secondary"><ListChecks size={14} className="mr-1" /> Modeles</button>
                <button onClick={() => setShowStart((v) => !v)} className="btn btn-primary"><Plus size={14} className="mr-1" /> Demarrer</button>
              </div>
            </div>

            {showStart && (
              <div className="card p-4 space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <select className="input" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                    <option value="">Collaborateur...</option>
                    {employees.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                  </select>
                  <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value, templateId: '' })}>
                    <option value="ONBOARDING">Arrivee (onboarding)</option>
                    <option value="OFFBOARDING">Depart (offboarding)</option>
                  </select>
                  <select className="input" value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}>
                    <option value="">Sans modele (vide)</option>
                    {filteredTemplates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.tasks.length} taches)</option>)}
                  </select>
                  <input type="date" className="input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} title="Date d'arrivee / depart" />
                </div>
                <input className="input" placeholder="Titre (optionnel, defaut = nom du modele)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowStart(false)} className="btn btn-secondary">Annuler</button>
                  <button onClick={startJourney} className="btn btn-primary">Demarrer le parcours</button>
                </div>
              </div>
            )}

            {showTpl && <TemplateManager templates={templates} onChange={reload} />}

            {managed.length === 0 ? <p className="text-sm text-slate-400">Aucun parcours.</p> : managed.map((j) => (
              <JourneyCard key={j.id} j={j} isManager open={!!open[j.id]}
                toggle={() => setOpen((s) => ({ ...s, [j.id]: !s[j.id] }))} onChange={reload} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function JourneyCard({ j, isManager, open, toggle, onChange }:
  { j: Journey; isManager: boolean; open: boolean; toggle: () => void; onChange: () => void }) {
  const [newTask, setNewTask] = useState('');
  const done = j.tasks.filter((t) => t.done).length;
  const pct = j.tasks.length ? Math.round((done / j.tasks.length) * 100) : 0;

  async function toggleTask(t: Task) {
    try { await api.patch('/journeys/tasks/' + t.id, { done: !t.done }); onChange(); }
    catch (e: any) { toast.error(e.message); }
  }
  async function addTask() {
    if (!newTask.trim()) return;
    try { await api.post('/journeys/' + j.id + '/tasks', { label: newTask.trim() }); setNewTask(''); onChange(); }
    catch (e: any) { toast.error(e.message); }
  }
  async function delTask(t: Task) {
    try { await api.delete('/journeys/tasks/' + t.id); onChange(); } catch (e: any) { toast.error(e.message); }
  }
  async function cancel() {
    if (!confirm('Annuler ce parcours ?')) return;
    try { await api.post('/journeys/' + j.id + '/cancel', {}); onChange(); } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="card overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50">
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className={'badge ' + (KIND[j.kind]?.cls ?? '')}>{KIND[j.kind]?.label}</span>
        <span className="font-medium">{j.title}</span>
        {j.employee && <span className="text-sm text-slate-500">{j.employee.firstName} {j.employee.lastName}</span>}
        {j.startDate && <span className="text-xs text-slate-400">{frDate(j.startDate)}</span>}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-500">{done}/{j.tasks.length}</span>
          <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden hidden sm:block">
            <div className="h-full bg-mdo-600" style={{ width: pct + '%' }} />
          </div>
          <span className={'badge ' + (JSTATUS[j.status]?.cls ?? '')}>{JSTATUS[j.status]?.label}</span>
        </div>
      </button>

      {open && (
        <div className="p-4 border-t space-y-2">
          {j.tasks.length === 0 && <p className="text-sm text-slate-400">Aucune tache.</p>}
          {j.tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-1">
              <input type="checkbox" checked={t.done} onChange={() => toggleTask(t)}
                disabled={j.status === 'CANCELLED'} className="w-4 h-4 accent-mdo-600 shrink-0" />
              <span className={'text-sm flex-1 ' + (t.done ? 'line-through text-slate-400' : '')}>{t.label}</span>
              {t.responsible && <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{t.responsible}</span>}
              {t.dueDate && <span className="text-xs text-slate-400">{frDate(t.dueDate)}</span>}
              {isManager && <button onClick={() => delTask(t)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>}
            </div>
          ))}
          {isManager && j.status !== 'CANCELLED' && (
            <div className="flex gap-2 pt-2">
              <input className="input" value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Ajouter une tache..." onKeyDown={(e) => e.key === 'Enter' && addTask()} />
              <button onClick={addTask} className="btn btn-secondary whitespace-nowrap"><Plus size={14} /></button>
              <button onClick={cancel} className="btn btn-secondary whitespace-nowrap text-red-600">Annuler</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TemplateManager({ templates, onChange }: { templates: Template[]; onChange: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('ONBOARDING');
  const [rows, setRows] = useState<{ label: string; responsible: string; offsetDays: string }[]>([{ label: '', responsible: '', offsetDays: '' }]);

  function setRow(i: number, patch: Partial<{ label: string; responsible: string; offsetDays: string }>) {
    setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  }
  async function save() {
    const tasks = rows.filter((r) => r.label.trim()).map((r) => ({
      label: r.label.trim(), responsible: r.responsible.trim() || undefined,
      offsetDays: r.offsetDays === '' ? undefined : Number(r.offsetDays),
    }));
    if (!name.trim() || tasks.length === 0) { toast.error('Nom + au moins une tache'); return; }
    try {
      await api.post('/journeys/templates', { name: name.trim(), kind, tasks });
      toast.success('Modele cree'); setName(''); setRows([{ label: '', responsible: '', offsetDays: '' }]); onChange();
    } catch (e: any) { toast.error(e.message); }
  }
  async function del(id: string) {
    if (!confirm('Supprimer ce modele ?')) return;
    try { await api.delete('/journeys/templates/' + id); onChange(); } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="card p-4 space-y-4 bg-slate-50/50">
      <div className="text-sm font-semibold">Modeles de checklist</div>
      {templates.length > 0 && (
        <div className="space-y-1">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-2 text-sm">
              <span className={'badge ' + (KIND[t.kind]?.cls ?? '')}>{KIND[t.kind]?.label}</span>
              <span className="font-medium">{t.name}</span>
              <span className="text-xs text-slate-400">{t.tasks.length} taches{t._count ? ` · ${t._count.journeys} parcours` : ''}</span>
              <button onClick={() => del(t.id)} className="ml-auto text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t pt-3 space-y-2">
        <div className="text-xs font-semibold text-slate-500">Nouveau modele</div>
        <div className="grid sm:grid-cols-2 gap-2">
          <input className="input" placeholder="Nom (ex: Arrivee technicien)" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="ONBOARDING">Arrivee</option>
            <option value="OFFBOARDING">Depart</option>
          </select>
        </div>
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input className="input flex-1" placeholder="Tache" value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} />
              <input className="input w-28" placeholder="Qui (RH/IT)" value={r.responsible} onChange={(e) => setRow(i, { responsible: e.target.value })} />
              <input className="input w-20" type="number" placeholder="J+/-" value={r.offsetDays} onChange={(e) => setRow(i, { offsetDays: e.target.value })} title="Echeance relative a la date de debut (ex: -7, 0, 30)" />
              <button onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} className="text-slate-300 hover:text-red-500"><X size={16} /></button>
            </div>
          ))}
          <button onClick={() => setRows((r) => [...r, { label: '', responsible: '', offsetDays: '' }])} className="text-sm text-mdo-600 hover:underline flex items-center gap-1"><Plus size={14} /> Ajouter une ligne</button>
        </div>
        <div className="flex justify-end"><button onClick={save} className="btn btn-primary">Creer le modele</button></div>
      </div>
    </div>
  );
}
