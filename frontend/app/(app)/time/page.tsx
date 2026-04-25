'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Play, Square, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

function formatHm(min: number | null | undefined): string {
  if (!min) return '0h00';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h + 'h' + String(m).padStart(2, '0');
}

function startOfWeekIso(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function TimePage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [current, setCurrent] = useState<any>(null);
  const [from, setFrom] = useState(startOfWeekIso().split('T')[0]);
  const [to, setTo] = useState(new Date().toISOString().split('T')[0]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<any>({
    startedAt: new Date().toISOString().slice(0, 16),
    durationMin: 30,
    billable: true,
  });

  async function load() {
    const [list, sum, cur] = await Promise.all([
      api.get('/time-entries?from=' + from + '&to=' + to),
      api.get('/time-entries/summary?from=' + from + '&to=' + to),
      api.get('/time-entries/current').catch(() => null),
    ]);
    setEntries(list);
    setSummary(sum);
    setCurrent(cur);
  }

  useEffect(() => { load(); }, [from, to]);

  async function startTimer() {
    try {
      await api.post('/time-entries/start', {});
      toast.success('Timer demarre');
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function stopTimer() {
    try {
      await api.post('/time-entries/stop');
      toast.success('Timer arrete');
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function createManual(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload: any = {
        startedAt: new Date(draft.startedAt).toISOString(),
        durationMin: Number(draft.durationMin),
        description: draft.description,
        billable: draft.billable,
      };
      await api.post('/time-entries', payload);
      toast.success('Saisie enregistree');
      setShowForm(false);
      setDraft({ startedAt: new Date().toISOString().slice(0, 16), durationMin: 30, billable: true });
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cette saisie ?')) return;
    await api.delete('/time-entries/' + id);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Mon temps</h1>
        <div className="flex gap-2">
          {current ? (
            <button onClick={stopTimer} className="btn btn-danger">
              <Square size={14} className="mr-1" /> Arreter le timer
            </button>
          ) : (
            <button onClick={startTimer} className="btn btn-secondary">
              <Play size={14} className="mr-1" /> Timer libre
            </button>
          )}
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
            <Plus size={14} className="mr-1" /> Saisie manuelle
          </button>
        </div>
      </div>

      {current && (
        <div className="card p-4 border-emerald-200 bg-emerald-50 text-sm">
          <strong>Timer en cours</strong> depuis {formatDateTime(current.startedAt)}
          {current.ticket && (
            <> - sur ticket <Link href={'/tickets/' + current.ticket.id} className="text-mdo-600 hover:underline">{current.ticket.reference}</Link></>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={createManual} className="card p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="label">Debut</label>
              <input type="datetime-local" required className="input" value={draft.startedAt}
                onChange={(e) => setDraft({ ...draft, startedAt: e.target.value })} />
            </div>
            <div>
              <label className="label">Duree (min)</label>
              <input type="number" required min={1} className="input" value={draft.durationMin}
                onChange={(e) => setDraft({ ...draft, durationMin: parseInt(e.target.value) })} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <input className="input" value={draft.description ?? ''}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <input type="checkbox" id="bill" checked={draft.billable}
                onChange={(e) => setDraft({ ...draft, billable: e.target.checked })} />
              <label htmlFor="bill" className="text-sm">Facturable</label>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Enregistrer</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Annuler</button>
          </div>
        </form>
      )}

      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Du</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">Au</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {summary && (
          <div className="ml-auto flex gap-4 text-sm">
            <Stat label="Total" value={formatHm(summary.totalMin)} />
            <Stat label="Facturable" value={formatHm(summary.billableMin)} color="text-emerald-600" />
            <Stat label="Non facturable" value={formatHm(summary.nonBillableMin)} color="text-slate-500" />
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Duree</th>
              <th className="p-3 font-medium">Lien</th>
              <th className="p-3 font-medium">Description</th>
              <th className="p-3 font-medium">Facturable</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-slate-400">Aucune saisie sur la periode</td></tr>
            ) : entries.map((e) => (
              <tr key={e.id} className="border-t hover:bg-slate-50">
                <td className="p-3">{formatDateTime(e.startedAt)}</td>
                <td className="p-3 font-medium">{e.endedAt ? formatHm(e.durationMin) : 'En cours'}</td>
                <td className="p-3">
                  {e.ticket && <Link href={'/tickets/' + e.ticket.id} className="text-mdo-600 hover:underline">{e.ticket.reference}</Link>}
                  {e.intervention && <span>{e.intervention.title}</span>}
                </td>
                <td className="p-3 max-w-xs truncate">{e.description ?? '-'}</td>
                <td className="p-3">{e.billable ? <span className="badge bg-emerald-100 text-emerald-700">Oui</span> : <span className="badge bg-slate-100 text-slate-700">Non</span>}</td>
                <td className="p-3">
                  <button onClick={() => remove(e.id)} className="text-red-500 hover:text-red-700">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, color = 'text-slate-700' }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={'font-semibold ' + color}>{value}</div>
    </div>
  );
}
