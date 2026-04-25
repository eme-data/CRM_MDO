'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Play, Square, Clock } from 'lucide-react';
import { api } from '@/lib/api';

function formatElapsed(start: Date): string {
  const diff = Math.floor((Date.now() - start.getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return (
    (h > 0 ? h + 'h ' : '') +
    String(m).padStart(2, '0') +
    'm ' +
    String(s).padStart(2, '0') +
    's'
  );
}

export function TicketTimerButton({ ticketId }: { ticketId: string }) {
  const [current, setCurrent] = useState<any>(null);
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      const c = await api.get('/time-entries/current');
      setCurrent(c);
    } catch {}
  }

  useEffect(() => {
    load();
    const i = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, []);

  const isOnThis = current && current.ticketId === ticketId;
  const isOnOther = current && current.ticketId && current.ticketId !== ticketId;

  async function start() {
    setLoading(true);
    try {
      await api.post('/time-entries/start', { ticketId });
      toast.success('Timer demarre');
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function stop() {
    setLoading(true);
    try {
      const e = await api.post('/time-entries/stop');
      toast.success('Timer arrete : ' + (e.durationMin ?? 0) + ' min enregistrees');
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (isOnThis) {
    const elapsed = formatElapsed(new Date(current.startedAt));
    return (
      <button onClick={stop} disabled={loading} className="btn btn-danger inline-flex items-center gap-2">
        <Square size={14} /> {elapsed}
      </button>
    );
  }
  if (isOnOther) {
    return (
      <button
        onClick={start}
        disabled={loading}
        className="btn btn-secondary inline-flex items-center gap-2"
        title={'Timer en cours sur ' + (current.ticket?.reference ?? 'autre ticket') + ' - cliquer remplacera'}
      >
        <Clock size={14} className="text-amber-500" /> Demarrer ici
      </button>
    );
  }
  return (
    <button onClick={start} disabled={loading} className="btn btn-secondary inline-flex items-center gap-2">
      <Play size={14} /> Demarrer le timer
    </button>
  );
}
