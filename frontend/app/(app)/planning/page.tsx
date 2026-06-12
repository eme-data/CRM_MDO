'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';

interface Day { date: string; weekend: boolean; holiday: boolean }
interface LeaveCell { typeName: string; color: string; half: boolean }
interface Person { userId: string; firstName: string; lastName: string; leaves: Record<string, LeaveCell> }
interface Planning { month: string; days: Day[]; people: Person[] }

const WD = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
function frMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export default function PlanningPage() {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [data, setData] = useState<Planning | null>(null);
  const [legend, setLegend] = useState<Record<string, string>>({});

  async function load(m?: string) {
    try {
      const res = await api.get<Planning>('/planning' + (m ? '?month=' + m : ''));
      setData(res);
      const leg: Record<string, string> = {};
      for (const p of res.people) for (const c of Object.values(p.leaves)) leg[c.typeName] = c.color;
      setLegend(leg);
    } catch (err: any) { toast.error('Chargement planning echoue : ' + (err?.message ?? 'erreur')); }
  }
  useEffect(() => { load(month); }, [month]);

  function dow(date: string) { return new Date(date + 'T00:00:00Z').getUTCDay(); }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold flex items-center gap-3"><CalendarRange size={28} className="text-mdo-600" /> Planning d'equipe</h1>

      {data && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setMonth(shiftMonth(data.month, -1))} className="btn btn-secondary px-2 py-1"><ChevronLeft size={16} /></button>
            <span className="font-semibold capitalize min-w-[10rem] text-center">{frMonth(data.month)}</span>
            <button onClick={() => setMonth(shiftMonth(data.month, 1))} className="btn btn-secondary px-2 py-1"><ChevronRight size={16} /></button>
            <button onClick={() => setMonth(undefined)} className="text-xs text-slate-500 hover:text-mdo-600 ml-1">ce mois</button>
            {Object.keys(legend).length > 0 && (
              <div className="flex items-center gap-3 ml-auto text-xs flex-wrap">
                {Object.entries(legend).map(([name, color]) => (
                  <span key={name} className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: color }} />{name}</span>
                ))}
              </div>
            )}
          </div>

          <div className="card overflow-x-auto">
            <table className="border-collapse text-xs w-full">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white p-2 text-left border-b border-r min-w-[10rem]">Collaborateur</th>
                  {data.days.map((d) => {
                    const off = d.weekend || d.holiday;
                    return (
                      <th key={d.date} className={'p-1 border-b text-center font-normal w-7 ' + (off ? 'bg-slate-100 text-slate-400' : 'text-slate-500')} title={d.holiday ? 'Jour ferie' : ''}>
                        <div>{WD[dow(d.date)]}</div>
                        <div className="font-semibold text-[11px] text-slate-700">{d.date.slice(8)}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data.people.length === 0 ? (
                  <tr><td colSpan={data.days.length + 1} className="p-6 text-center text-slate-400">Aucun collaborateur.</td></tr>
                ) : data.people.map((p) => (
                  <tr key={p.userId} className="hover:bg-slate-50">
                    <td className="sticky left-0 z-10 bg-white p-2 border-r border-b whitespace-nowrap">{p.firstName} {p.lastName}</td>
                    {data.days.map((d) => {
                      const cell = p.leaves[d.date];
                      const off = d.weekend || d.holiday;
                      if (cell) {
                        return (
                          <td key={d.date} className="border-b text-center p-0" title={cell.typeName + (cell.half ? ' (demi-journee)' : '')}>
                            <div className="h-7 w-full" style={cell.half
                              ? { background: 'linear-gradient(135deg,' + cell.color + ' 50%, transparent 50%)' }
                              : { background: cell.color }} />
                          </td>
                        );
                      }
                      return <td key={d.date} className={'border-b ' + (off ? 'bg-slate-100' : '')} />;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">Conges valides uniquement. Les demandes en attente n'apparaissent pas. Saisie dans « Conges & absences ».</p>
        </>
      )}
    </div>
  );
}
