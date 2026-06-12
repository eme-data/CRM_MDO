'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MessagesSquare, Plus, Target, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { me as fetchMe, User } from '@/lib/auth';

interface Obj { id: string; title: string; description: string | null; status: string; progress: number; dueDate: string | null }
interface Person { id: string; firstName: string; lastName: string }
interface Review {
  id: string; type: string; status: string; scheduledAt: string | null; completedAt: string | null;
  employeeNotes: string | null; managerNotes: string | null; summary: string | null; rating: number | null;
  employee?: Person; manager?: Person; objectives: Obj[];
}

const TYPES: Record<string, string> = { ANNUAL: 'Annuel', PROFESSIONAL: 'Professionnel', PROBATION: 'Periode d\'essai', ONE_ON_ONE: 'Individuel' };
const RSTATUS: Record<string, { label: string; cls: string }> = {
  SCHEDULED: { label: 'Planifie', cls: 'bg-sky-100 text-sky-700' },
  IN_PROGRESS: { label: 'En cours', cls: 'bg-amber-100 text-amber-800' },
  COMPLETED: { label: 'Realise', cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'Annule', cls: 'bg-slate-100 text-slate-500' },
};
const OSTATUS: Record<string, { label: string; cls: string }> = {
  TODO: { label: 'A faire', cls: 'bg-slate-100 text-slate-600' },
  IN_PROGRESS: { label: 'En cours', cls: 'bg-amber-100 text-amber-800' },
  DONE: { label: 'Atteint', cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'Abandonne', cls: 'bg-slate-100 text-slate-400' },
};
function frDate(s: string | null) { return s ? new Date(s).toLocaleDateString('fr-FR') : '-'; }

export default function EntretiensPage() {
  const [user, setUser] = useState<User | null>(null);
  const [mine, setMine] = useState<Review[]>([]);
  const [managed, setManaged] = useState<Review[]>([]);
  const [myObjectives, setMyObjectives] = useState<Obj[]>([]);
  const [employees, setEmployees] = useState<Person[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [planning, setPlanning] = useState(false);
  const [form, setForm] = useState({ employeeId: '', type: 'ANNUAL', scheduledAt: '' });

  const isManager = !!user && (user.isSuperAdmin || user.role === 'ADMIN' || user.role === 'MANAGER');

  async function reload() {
    try { setMine(await api.get<Review[]>('/reviews/mine')); } catch { /* */ }
    try { setMyObjectives(await api.get<Obj[]>('/objectives/mine')); } catch { /* */ }
    if (isManager) {
      try { setManaged(await api.get<Review[]>('/reviews')); } catch { /* */ }
      try { setEmployees(await api.get<Person[]>('/employees')); } catch { /* */ }
    }
  }
  useEffect(() => { fetchMe().then(setUser).catch(() => {}); }, []);
  useEffect(() => { if (user) reload(); }, [user]);

  async function createReview() {
    if (!form.employeeId) { toast.error('Choisissez un collaborateur'); return; }
    try {
      await api.post('/reviews', { employeeId: form.employeeId, type: form.type, scheduledAt: form.scheduledAt || undefined });
      toast.success('Entretien planifie'); setPlanning(false); setForm({ employeeId: '', type: 'ANNUAL', scheduledAt: '' }); reload();
    } catch (err: any) { toast.error(err.message ?? 'Erreur'); }
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <h1 className="text-3xl font-bold flex items-center gap-3"><MessagesSquare size={28} className="text-mdo-600" /> Entretiens & objectifs</h1>

      {/* Mes objectifs */}
      <section className="space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Target size={18} /> Mes objectifs</h2>
        {myObjectives.length === 0 ? <p className="text-sm text-slate-400">Aucun objectif assigne.</p> : (
          <div className="space-y-2">
            {myObjectives.map((o) => <ObjectiveRow key={o.id} o={o} canManage={false} onChange={reload} />)}
          </div>
        )}
      </section>

      {/* Mes entretiens */}
      <section className="space-y-3">
        <h2 className="font-semibold">Mes entretiens</h2>
        {mine.length === 0 ? <p className="text-sm text-slate-400">Aucun entretien.</p> : mine.map((r) => (
          <ReviewCard key={r.id} r={r} me={user!} isManager={false} open={!!open[r.id]}
            toggle={() => setOpen((s) => ({ ...s, [r.id]: !s[r.id] }))} onChange={reload} employees={employees} />
        ))}
      </section>

      {/* Manager : entretiens equipe */}
      {isManager && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Entretiens de l'equipe</h2>
            <button onClick={() => setPlanning((v) => !v)} className="btn btn-primary"><Plus size={14} className="mr-1" /> Planifier</button>
          </div>
          {planning && (
            <div className="card p-4 space-y-3">
              <div className="grid sm:grid-cols-3 gap-3">
                <select className="input" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                  <option value="">Collaborateur...</option>
                  {employees.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                </select>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input type="date" className="input" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setPlanning(false)} className="btn btn-secondary">Annuler</button>
                <button onClick={createReview} className="btn btn-primary">Creer</button>
              </div>
            </div>
          )}
          {managed.length === 0 ? <p className="text-sm text-slate-400">Aucun entretien planifie.</p> : managed.map((r) => (
            <ReviewCard key={r.id} r={r} me={user!} isManager open={!!open[r.id]}
              toggle={() => setOpen((s) => ({ ...s, [r.id]: !s[r.id] }))} onChange={reload} employees={employees} />
          ))}
        </section>
      )}
    </div>
  );
}

function ReviewCard({ r, isManager, open, toggle, onChange }:
  { r: Review; me: User; isManager: boolean; open: boolean; toggle: () => void; onChange: () => void; employees: Person[] }) {
  const [empNotes, setEmpNotes] = useState(r.employeeNotes ?? '');
  const [mgrNotes, setMgrNotes] = useState(r.managerNotes ?? '');
  const [summary, setSummary] = useState(r.summary ?? '');
  const [rating, setRating] = useState<number | ''>(r.rating ?? '');
  const [status, setStatus] = useState(r.status);
  const [newObj, setNewObj] = useState('');

  async function saveEmployee() {
    try { await api.patch('/reviews/' + r.id, { employeeNotes: empNotes }); toast.success('Preparation enregistree'); onChange(); }
    catch (e: any) { toast.error(e.message); }
  }
  async function saveManager() {
    try {
      await api.patch('/reviews/' + r.id, { managerNotes: mgrNotes, summary, status, rating: rating === '' ? undefined : Number(rating) });
      toast.success('Entretien mis a jour'); onChange();
    } catch (e: any) { toast.error(e.message); }
  }
  async function addObjective() {
    if (!newObj.trim()) return;
    const userId = r.employee?.id;
    if (!userId) return;
    try { await api.post('/objectives', { userId, title: newObj.trim(), reviewId: r.id }); setNewObj(''); toast.success('Objectif ajoute'); onChange(); }
    catch (e: any) { toast.error(e.message); }
  }

  const who = r.employee ? r.employee.firstName + ' ' + r.employee.lastName : (r.manager ? 'avec ' + r.manager.firstName + ' ' + r.manager.lastName : '');

  return (
    <div className="card overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50">
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="font-medium">{TYPES[r.type]}</span>
        <span className="text-sm text-slate-500">{who}</span>
        <span className="text-sm text-slate-400">{frDate(r.scheduledAt)}</span>
        <span className={'badge ml-auto ' + (RSTATUS[r.status]?.cls ?? '')}>{RSTATUS[r.status]?.label}</span>
        {r.rating ? <span className="text-amber-500 text-sm">{'★'.repeat(r.rating)}</span> : null}
      </button>

      {open && (
        <div className="p-4 border-t space-y-4">
          {/* Compte-rendu partage */}
          {r.summary && !isManager && (
            <div><div className="text-xs font-semibold text-slate-500 mb-1">Compte-rendu</div><p className="text-sm whitespace-pre-wrap">{r.summary}</p></div>
          )}

          {/* Preparation collaborateur (visible/editable par le collaborateur lui-meme) */}
          {!isManager && (
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1">Ma preparation</div>
              <textarea className="input min-h-[90px]" value={empNotes} onChange={(e) => setEmpNotes(e.target.value)} placeholder="Vos points a aborder, souhaits d'evolution..." />
              <div className="flex justify-end mt-2"><button onClick={saveEmployee} className="btn btn-primary">Enregistrer</button></div>
            </div>
          )}

          {/* Cote manager */}
          {isManager && (
            <div className="space-y-3">
              {r.employeeNotes && (
                <div><div className="text-xs font-semibold text-slate-500 mb-1">Preparation du collaborateur</div><p className="text-sm whitespace-pre-wrap bg-slate-50 rounded p-2">{r.employeeNotes}</p></div>
              )}
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-1">Mes notes (privees)</div>
                <textarea className="input min-h-[70px]" value={mgrNotes} onChange={(e) => setMgrNotes(e.target.value)} />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-1">Compte-rendu partage</div>
                <textarea className="input min-h-[70px]" value={summary} onChange={(e) => setSummary(e.target.value)} />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-sm">Statut
                  <select className="input ml-2 inline-block w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
                    {Object.entries(RSTATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </label>
                <label className="text-sm">Note
                  <select className="input ml-2 inline-block w-auto" value={rating} onChange={(e) => setRating(e.target.value === '' ? '' : Number(e.target.value))}>
                    <option value="">-</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <button onClick={saveManager} className="btn btn-primary ml-auto">Enregistrer</button>
              </div>
            </div>
          )}

          {/* Objectifs lies */}
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1"><Target size={14} /> Objectifs</div>
            <div className="space-y-2">
              {r.objectives.length === 0 && <p className="text-sm text-slate-400">Aucun objectif.</p>}
              {r.objectives.map((o) => <ObjectiveRow key={o.id} o={o} canManage={isManager} onChange={onChange} />)}
            </div>
            {isManager && (
              <div className="flex gap-2 mt-2">
                <input className="input" value={newObj} onChange={(e) => setNewObj(e.target.value)} placeholder="Nouvel objectif..." onKeyDown={(e) => e.key === 'Enter' && addObjective()} />
                <button onClick={addObjective} className="btn btn-secondary whitespace-nowrap"><Plus size={14} /></button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ObjectiveRow({ o, canManage, onChange }: { o: Obj; canManage: boolean; onChange: () => void }) {
  const [progress, setProgress] = useState(o.progress);
  const [status, setStatus] = useState(o.status);
  async function save(p: number, s: string) {
    try { await api.patch('/objectives/' + o.id, { progress: p, status: s }); onChange(); }
    catch (e: any) { toast.error(e.message); }
  }
  async function del() {
    if (!confirm('Supprimer cet objectif ?')) return;
    try { await api.delete('/objectives/' + o.id); onChange(); } catch (e: any) { toast.error(e.message); }
  }
  return (
    <div className="border rounded-md p-2.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium flex-1">{o.title}</span>
        <span className={'badge ' + (OSTATUS[status]?.cls ?? '')}>{OSTATUS[status]?.label}</span>
        {o.dueDate && <span className="text-xs text-slate-400">{frDate(o.dueDate)}</span>}
        {canManage && <button onClick={del} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>}
      </div>
      {o.description && <p className="text-xs text-slate-500 mt-1">{o.description}</p>}
      <div className="flex items-center gap-2 mt-2">
        <input type="range" min={0} max={100} step={5} value={progress}
          onChange={(e) => setProgress(Number(e.target.value))}
          onMouseUp={() => save(progress, progress >= 100 ? 'DONE' : status === 'TODO' ? 'IN_PROGRESS' : status)}
          onTouchEnd={() => save(progress, progress >= 100 ? 'DONE' : status === 'TODO' ? 'IN_PROGRESS' : status)}
          className="flex-1 accent-mdo-600" />
        <span className="text-xs w-10 text-right">{progress}%</span>
        <select className="input w-auto py-1 text-xs" value={status} onChange={(e) => { setStatus(e.target.value); save(progress, e.target.value); }}>
          {Object.entries(OSTATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
    </div>
  );
}
