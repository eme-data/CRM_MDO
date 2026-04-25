'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function startOfMonthMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = (d.getDay() + 6) % 7; // lundi=0
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

const STATUS_COLOR: Record<string, string> = {
  PLANNED: 'bg-blue-200 text-blue-900',
  IN_PROGRESS: 'bg-amber-200 text-amber-900',
  DONE: 'bg-emerald-200 text-emerald-900',
  CANCELLED: 'bg-slate-200 text-slate-700 line-through',
};

export default function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    api.get('/interventions').then(setItems);
  }, []);

  const grid = useMemo(() => {
    const start = startOfMonthMonday(cursor);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }, [cursor]);

  const itemsByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const it of items) {
      const d = new Date(it.scheduledAt);
      const key = d.toISOString().split('T')[0];
      if (!map[key]) map[key] = [];
      map[key].push(it);
    }
    return map;
  }, [items]);

  const monthLabel = cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Calendrier des interventions</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="btn btn-secondary"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="font-medium capitalize px-4">{monthLabel}</span>
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="btn btn-secondary"
          >
            <ChevronRight size={14} />
          </button>
          <button
            onClick={() => setCursor(new Date())}
            className="btn btn-secondary text-xs"
          >
            Aujourd'hui
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600">
          {DAYS.map((d) => (
            <div key={d} className="p-2 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.map((d, i) => {
            const isCurrent = d.getMonth() === cursor.getMonth();
            const isToday = d.toDateString() === new Date().toDateString();
            const key = d.toISOString().split('T')[0];
            const dayItems = itemsByDay[key] ?? [];
            return (
              <div
                key={i}
                className={
                  'min-h-[110px] p-1 border-r border-b border-slate-200 dark:border-slate-700 ' +
                  (isCurrent ? '' : 'bg-slate-50/50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500')
                }
              >
                <div className={'text-xs font-medium mb-1 ' + (isToday ? 'text-mdo-600' : '')}>
                  {d.getDate()}
                </div>
                <div className="space-y-1">
                  {dayItems.map((it) => (
                    <Link
                      key={it.id}
                      href={'/interventions'}
                      className={'block text-xs px-1.5 py-0.5 rounded truncate ' + (STATUS_COLOR[it.status] ?? '')}
                      title={it.title + ' - ' + (it.company?.name ?? '')}
                    >
                      {new Date(it.scheduledAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}{' '}
                      {it.title}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-3 text-xs space-y-1">
        <div className="font-semibold mb-2">Legende</div>
        <div className="flex gap-3">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-200"></span> Planifie</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-200"></span> En cours</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-200"></span> Termine</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-200"></span> Annule</span>
        </div>
      </div>
    </div>
  );
}
