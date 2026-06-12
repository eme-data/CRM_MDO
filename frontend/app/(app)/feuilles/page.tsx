'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Timer, ChevronLeft, ChevronRight, Send, Check, X, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { me as fetchMe, User } from '@/lib/auth';

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

interface DayCell { date: string; minutes: number }
interface Sheet { id: string; status: string; totalMinutes: number; periodStart: string; decisionNote: string | null; approver?: { firstName: string; lastName: string } | null }
interface WeekSummary { periodStart: string; periodEnd: string; days: DayCell[]; totalMinutes: number; timesheet: Sheet | null }
interface Pending { id: string; totalMinutes: number; periodStart: string; user?: { firstName: string; lastName: string } }

const STATUS: Record<string, { label: string; cls: string }> = {
  SUBMITTED: { label: 'En attente', cls: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Validee', cls: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { label: 'Refusee', cls: 'bg-red-100 text-red-700' },
  DRAFT: { label: 'Brouillon', cls: 'bg-slate-100 text-slate-600' },
};

function h(min: number) { return (min / 60).toFixed(1) + ' h'; }
function shiftWeek(periodStart: string, deltaDays: number): string {
  const d = new Date(periodStart + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
function frDate(ymd: string) { return ymd.split('-').reverse().join('/'); }

export default function FeuillesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [week, setWeek] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState<WeekSummary | null>(null);
  const [mine, setMine] = useState<Sheet[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const isManager = !!user && (user.isSuperAdmin || user.role === 'ADMIN' || user.role === 'MANAGER');

  async function loadWeek(w?: string) {
    try { setSummary(await api.get<WeekSummary>('/timesheets/week' + (w ? '?week=' + w : ''))); }
    catch (err: any) { toast.error('Chargement semaine echoue : ' + (err?.message ?? 'erreur')); }
  }
  async function loadMine() { try { setMine(await api.get<Sheet[]>('/timesheets/mine')); } catch { /* */ } }
  async function loadPending() { try { setPending(await api.get<Pending[]>('/timesheets/pending')); } catch { /* */ } }

  useEffect(() => { fetchMe().then(setUser).catch(() => {}); }, []);
  useEffect(() => { loadWeek(week); }, [week]);
  useEffect(() => { loadMine(); }, []);
  useEffect(() => { if (isManager) loadPending(); }, [isManager]);

  async function submit() {
    if (!summary) return;
    setSubmitting(true);
    try {
      await api.post('/timesheets/submit', { week: summary.periodStart });
      toast.success('Feuille soumise');
      loadWeek(week); loadMine();
    } catch (err: any) { toast.error(err.message ?? 'Erreur'); }
    finally { setSubmitting(false); }
  }
  async function decide(id: string, approve: boolean) {
    let note: string | undefined;
    if (!approve) note = window.prompt('Motif du refus (optionnel) :') ?? undefined;
    try { await api.post('/timesheets/' + id + '/decide', { approve, note }); toast.success(approve ? 'Validee' : 'Refusee'); loadPending(); loadMine(); loadWeek(week); }
    catch (err: any) { toast.error(err.message); }
  }

  const st = summary?.timesheet?.status;
  const canSubmit = summary && summary.totalMinutes > 0 && st !== 'APPROVED';

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-3xl font-bold flex items-center gap-3"><Timer size={28} className="text-mdo-600" /> Feuilles de temps</h1>

      {/* Semaine courante */}
      {summary && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <button onClick={() => setWeek(shiftWeek(summary.periodStart, -7))} className="btn btn-secondary px-2 py-1"><ChevronLeft size={16} /></button>
              <span className="font-semibold">Semaine du {frDate(summary.periodStart)} au {frDate(summary.periodEnd)}</span>
              <button onClick={() => setWeek(shiftWeek(summary.periodStart, 7))} className="btn btn-secondary px-2 py-1"><ChevronRight size={16} /></button>
              <button onClick={() => setWeek(undefined)} className="text-xs text-slate-500 hover:text-mdo-600 ml-1">cette semaine</button>
            </div>
            {summary.timesheet && <span className={'badge ' + (STATUS[summary.timesheet.status]?.cls ?? '')}>{STATUS[summary.timesheet.status]?.label}</span>}
          </div>

          <div className="grid grid-cols-7 gap-2 text-center">
            {summary.days.map((d, i) => (
              <div key={d.date} className={'rounded-md border p-2 ' + (d.minutes > 0 ? 'bg-mdo-50 border-mdo-200' : 'bg-slate-50')}>
                <div className="text-xs text-slate-500">{DAYS[i]}</div>
                <div className="text-[10px] text-slate-400">{frDate(d.date).slice(0, 5)}</div>
                <div className="font-semibold text-sm mt-1">{d.minutes > 0 ? h(d.minutes) : '-'}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm">Total : <strong>{h(summary.totalMinutes)}</strong></span>
            {summary.timesheet?.decisionNote && <span className="text-xs text-red-500">{summary.timesheet.decisionNote}</span>}
            <button onClick={submit} disabled={!canSubmit || submitting} className="btn btn-primary">
              <Send size={14} className="mr-1" />
              {submitting ? '...' : st === 'SUBMITTED' ? 'Re-soumettre' : 'Soumettre la semaine'}
            </button>
          </div>
          <p className="text-xs text-slate-400">Les heures proviennent de votre saisie dans « Mon temps ». Soumettez la semaine pour validation par votre manager.</p>
        </div>
      )}

      {/* A valider (managers) */}
      {isManager && pending.length > 0 && (
        <div className="card overflow-hidden border-amber-200">
          <div className="p-3 border-b bg-amber-50 font-semibold flex items-center gap-2 text-amber-800"><Clock size={16} /> Feuilles a valider ({pending.length})</div>
          <table className="w-full text-sm"><tbody>
            {pending.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-3">{p.user?.firstName} {p.user?.lastName}</td>
                <td className="p-3">Semaine du {frDate(p.periodStart)}</td>
                <td className="p-3 font-medium">{h(p.totalMinutes)}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button onClick={() => decide(p.id, true)} className="text-emerald-600 hover:text-emerald-800 mr-3" title="Valider"><Check size={16} /></button>
                  <button onClick={() => decide(p.id, false)} className="text-red-500 hover:text-red-700" title="Refuser"><X size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {/* Mes feuilles */}
      <div className="card overflow-hidden">
        <div className="p-3 border-b font-semibold">Mes feuilles</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="p-3">Semaine</th><th className="p-3">Total</th><th className="p-3">Statut</th><th className="p-3">Validee par</th></tr>
          </thead>
          <tbody>
            {mine.length === 0 ? (
              <tr><td colSpan={4} className="p-6 text-center text-slate-400">Aucune feuille soumise.</td></tr>
            ) : mine.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="p-3">{frDate(s.periodStart)}</td>
                <td className="p-3 font-medium">{h(s.totalMinutes)}</td>
                <td className="p-3"><span className={'badge ' + (STATUS[s.status]?.cls ?? '')}>{STATUS[s.status]?.label ?? s.status}</span>{s.decisionNote && <div className="text-xs text-slate-400 mt-0.5">{s.decisionNote}</div>}</td>
                <td className="p-3 text-xs text-slate-500">{s.approver ? s.approver.firstName + ' ' + s.approver.lastName : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
