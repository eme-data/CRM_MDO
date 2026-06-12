'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, Plus, Check, X, Clock, Users as UsersIcon, SlidersHorizontal, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { me as fetchMe, User } from '@/lib/auth';
import { formatDate } from '@/lib/utils';

interface LeaveType { id: string; name: string; color: string; paid: boolean }
interface BalanceItem { typeId: string; type: string; color: string; paid: boolean; allocated: number; taken: number; remaining: number }
interface LeaveRequest {
  id: string; status: string; startDate: string; endDate: string;
  halfStart: boolean; halfEnd: boolean; workingDays: string | number; reason: string | null;
  decisionNote: string | null;
  type: { name: string; color: string };
  user?: { id: string; firstName: string; lastName: string };
  approver?: { firstName: string; lastName: string } | null;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'En attente', cls: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Valide', cls: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'Refuse', cls: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Annule', cls: 'bg-slate-100 text-slate-600' },
};

function days(r: LeaveRequest) { return Number(r.workingDays); }

export default function CongesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<{ year: number; items: BalanceItem[] } | null>(null);
  const [mine, setMine] = useState<LeaveRequest[]>([]);
  const [pending, setPending] = useState<LeaveRequest[]>([]);
  const [team, setTeam] = useState<LeaveRequest[]>([]);
  const [draft, setDraft] = useState<any>({ typeId: '', startDate: '', endDate: '', halfStart: false, halfEnd: false, reason: '' });
  const [submitting, setSubmitting] = useState(false);
  // Gestion des soldes (managers)
  const [showAlloc, setShowAlloc] = useState(false);
  const [allRows, setAllRows] = useState<any[]>([]);
  const [allocYear, setAllocYear] = useState<number>(new Date().getFullYear());
  const [allocDraft, setAllocDraft] = useState<Record<string, string>>({});
  const [savingAlloc, setSavingAlloc] = useState(false);

  const isManager = !!user && (user.isSuperAdmin || user.role === 'ADMIN' || user.role === 'MANAGER');

  async function load() {
    try {
      const [t, b, m, tu] = await Promise.all([
        api.get<LeaveType[]>('/leaves/types'),
        api.get<{ year: number; items: BalanceItem[] }>('/leaves/balances'),
        api.get<LeaveRequest[]>('/leaves/mine'),
        api.get<LeaveRequest[]>('/leaves/team-upcoming'),
      ]);
      setTypes(t);
      setBalances(b);
      setMine(m);
      setTeam(tu);
      if (!draft.typeId && t.length) setDraft((d: any) => ({ ...d, typeId: t[0].id }));
    } catch (err: any) {
      toast.error('Chargement conges echoue : ' + (err?.message ?? 'erreur'));
    }
  }

  async function loadPending() {
    try { setPending(await api.get<LeaveRequest[]>('/leaves/pending')); } catch { /* non-manager */ }
  }

  useEffect(() => { fetchMe().then(setUser).catch(() => {}); }, []);
  useEffect(() => { load(); }, []);
  useEffect(() => { if (isManager) loadPending(); }, [isManager]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.typeId || !draft.startDate || !draft.endDate) { toast.error('Type et dates requis'); return; }
    setSubmitting(true);
    try {
      await api.post('/leaves', {
        typeId: draft.typeId,
        startDate: draft.startDate,
        endDate: draft.endDate,
        halfStart: !!draft.halfStart,
        halfEnd: !!draft.halfEnd,
        reason: draft.reason || undefined,
      });
      toast.success('Demande envoyee');
      setDraft((d: any) => ({ ...d, startDate: '', endDate: '', halfStart: false, halfEnd: false, reason: '' }));
      load();
    } catch (err: any) { toast.error(err.message ?? 'Erreur'); }
    finally { setSubmitting(false); }
  }

  async function cancel(id: string) {
    try { await api.post('/leaves/' + id + '/cancel', {}); toast.success('Demande annulee'); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  async function decide(id: string, approve: boolean) {
    let note: string | undefined;
    if (!approve) { note = window.prompt('Motif du refus (optionnel) :') ?? undefined; }
    try {
      await api.post('/leaves/' + id + '/decide', { approve, note });
      toast.success(approve ? 'Demande validee' : 'Demande refusee');
      loadPending(); load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function loadAlloc(year = allocYear) {
    try {
      const rows = await api.get<any[]>('/leaves/balances/all?year=' + year);
      setAllRows(rows);
      const d: Record<string, string> = {};
      for (const row of rows) for (const it of row.items) d[row.user.id + '|' + it.typeId] = String(it.allocated);
      setAllocDraft(d);
    } catch (err: any) { toast.error(err?.message ?? 'Chargement des soldes echoue'); }
  }

  function openAlloc() { setShowAlloc(true); loadAlloc(allocYear); }

  function changeYear(y: number) { setAllocYear(y); loadAlloc(y); }

  async function saveAlloc() {
    const changes: any[] = [];
    for (const row of allRows) {
      for (const it of row.items) {
        const key = row.user.id + '|' + it.typeId;
        const v = allocDraft[key];
        if (v !== undefined && Number(v) !== Number(it.allocated)) {
          changes.push({ userId: row.user.id, typeId: it.typeId, year: allocYear, allocated: Number(v) });
        }
      }
    }
    if (!changes.length) { toast.info('Aucune modification a enregistrer'); return; }
    setSavingAlloc(true);
    try {
      for (const c of changes) await api.post('/leaves/allocations', c);
      toast.success(changes.length + ' solde(s) mis a jour');
      loadAlloc(allocYear); load();
    } catch (err: any) { toast.error(err.message); }
    finally { setSavingAlloc(false); }
  }

  function periode(r: LeaveRequest) {
    const half = (r.halfStart || r.halfEnd) ? ' (demi-j)' : '';
    return (r.startDate === r.endDate ? formatDate(r.startDate) : formatDate(r.startDate) + ' -> ' + formatDate(r.endDate)) + half;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-3xl font-bold flex items-center gap-3">
        <CalendarDays size={28} className="text-mdo-600" /> Conges & absences
      </h1>

      {/* Soldes */}
      {balances && (
        <div>
          <h2 className="font-semibold mb-2">Mes soldes {balances.year}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {balances.items.map((b) => (
              <div key={b.typeId} className="card p-3 border-l-4" style={{ borderLeftColor: b.color }}>
                <p className="text-xs text-slate-500">{b.type}</p>
                <p className="text-2xl font-bold">{b.remaining}<span className="text-sm font-normal text-slate-400"> / {b.allocated}</span></p>
                <p className="text-xs text-slate-400">{b.taken} pris</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1">Restant / alloue. L&apos;allocation est definie par un manager.</p>
        </div>
      )}

      {/* Nouvelle demande */}
      <form onSubmit={submit} className="card p-6 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Plus size={18} className="text-mdo-600" /> Nouvelle demande</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Type</label>
            <select className="input" value={draft.typeId} onChange={(e) => setDraft({ ...draft, typeId: e.target.value })}>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div><label className="label">Du</label><input type="date" className="input" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value, endDate: draft.endDate || e.target.value })} /></div>
          <div><label className="label">Au</label><input type="date" className="input" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} /></div>
          <div><label className="label">Motif (optionnel)</label><input className="input" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-1"><input type="checkbox" checked={draft.halfStart} onChange={(e) => setDraft({ ...draft, halfStart: e.target.checked })} /> 1er jour : apres-midi seulement</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={draft.halfEnd} onChange={(e) => setDraft({ ...draft, halfEnd: e.target.checked })} /> Dernier jour : matin seulement</label>
          <button type="submit" disabled={submitting} className="btn btn-primary ml-auto">{submitting ? 'Envoi...' : 'Envoyer la demande'}</button>
        </div>
      </form>

      {/* A valider (managers) */}
      {isManager && pending.length > 0 && (
        <div className="card overflow-hidden border-amber-200">
          <div className="p-3 border-b bg-amber-50 font-semibold flex items-center gap-2 text-amber-800"><Clock size={16} /> A valider ({pending.length})</div>
          <table className="w-full text-sm">
            <tbody>
              {pending.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{r.user?.firstName} {r.user?.lastName}</td>
                  <td className="p-3"><span className="badge" style={{ background: r.type.color + '22', color: r.type.color }}>{r.type.name}</span></td>
                  <td className="p-3">{periode(r)}</td>
                  <td className="p-3 font-medium">{days(r)} j</td>
                  <td className="p-3 text-slate-500 text-xs">{r.reason}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button onClick={() => decide(r.id, true)} className="text-emerald-600 hover:text-emerald-800 mr-3" title="Valider"><Check size={16} /></button>
                    <button onClick={() => decide(r.id, false)} className="text-red-500 hover:text-red-700" title="Refuser"><X size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mes demandes */}
      <div className="card overflow-hidden">
        <div className="p-3 border-b font-semibold">Mes demandes</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="p-3">Type</th><th className="p-3">Periode</th><th className="p-3">Jours</th><th className="p-3">Statut</th><th className="p-3">Validee par</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {mine.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-slate-400">Aucune demande pour le moment.</td></tr>
            ) : mine.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-3"><span className="badge" style={{ background: r.type.color + '22', color: r.type.color }}>{r.type.name}</span></td>
                <td className="p-3">{periode(r)}</td>
                <td className="p-3 font-medium">{days(r)} j</td>
                <td className="p-3">
                  <span className={'badge ' + (STATUS[r.status]?.cls ?? '')}>{STATUS[r.status]?.label ?? r.status}</span>
                  {r.decisionNote && <div className="text-xs text-slate-400 mt-0.5">{r.decisionNote}</div>}
                </td>
                <td className="p-3 text-xs text-slate-500">{r.approver ? r.approver.firstName + ' ' + r.approver.lastName : '-'}</td>
                <td className="p-3 text-right">
                  {(r.status === 'PENDING' || r.status === 'APPROVED') && (
                    <button onClick={() => cancel(r.id)} className="text-xs text-slate-500 hover:text-red-600">Annuler</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Conges equipe a venir */}
      <div className="card overflow-hidden">
        <div className="p-3 border-b font-semibold flex items-center gap-2"><UsersIcon size={16} className="text-mdo-600" /> Conges a venir (equipe)</div>
        {team.length === 0 ? (
          <p className="p-6 text-center text-slate-400 text-sm">Aucun conge valide a venir.</p>
        ) : (
          <ul className="divide-y">
            {team.map((r) => (
              <li key={r.id} className="p-3 flex items-center gap-3 text-sm">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.type.color }} />
                <span className="font-medium">{r.user?.firstName} {r.user?.lastName}</span>
                <span className="text-slate-500">{r.type.name}</span>
                <span className="text-slate-400 ml-auto">{periode(r)} · {days(r)} j</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Gestion des soldes (managers) */}
      {isManager && (
        <div className="card overflow-hidden">
          <div className="p-3 border-b font-semibold flex items-center justify-between gap-2">
            <span className="flex items-center gap-2"><SlidersHorizontal size={16} className="text-mdo-600" /> Gestion des soldes (equipe)</span>
            {!showAlloc ? (
              <button onClick={openAlloc} className="btn btn-secondary text-xs">Ouvrir</button>
            ) : (
              <div className="flex items-center gap-2">
                <select className="input py-1 text-sm" value={allocYear} onChange={(e) => changeYear(Number(e.target.value))}>
                  {[allocYear - 1, allocYear, allocYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <button onClick={saveAlloc} disabled={savingAlloc} className="btn btn-primary text-xs"><Save size={14} className="mr-1" />{savingAlloc ? '...' : 'Enregistrer'}</button>
              </div>
            )}
          </div>
          {showAlloc && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-3">Collaborateur</th>
                    {types.map((t) => <th key={t.id} className="p-3 text-center">{t.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {allRows.length === 0 ? (
                    <tr><td colSpan={types.length + 1} className="p-6 text-center text-slate-400">Aucun collaborateur.</td></tr>
                  ) : allRows.map((row) => (
                    <tr key={row.user.id} className="border-t">
                      <td className="p-3 font-medium whitespace-nowrap">{row.user.firstName} {row.user.lastName}</td>
                      {types.map((t) => {
                        const it = row.items.find((x: any) => x.typeId === t.id);
                        const key = row.user.id + '|' + t.id;
                        return (
                          <td key={t.id} className="p-2 text-center">
                            <input
                              type="number" step="0.5" min="0"
                              className="input w-20 text-center py-1"
                              value={allocDraft[key] ?? ''}
                              onChange={(e) => setAllocDraft((d) => ({ ...d, [key]: e.target.value }))}
                            />
                            {it && <div className="text-[10px] text-slate-400 mt-0.5">{it.taken} pris</div>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-slate-400 p-3">Jours alloues par collaborateur et par type pour l&apos;annee {allocYear}. « pris » = jours valides cette annee.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
