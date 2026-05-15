'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Wrench, Play, Pause, CheckCircle2, MapPin, Phone, Camera, Clock, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useReloadOnFocus } from '@/lib/useReloadOnFocus';
import { formatDateTime } from '@/lib/utils';

interface Intervention {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduledAt: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMin: number | null;
  description: string | null;
  report: string | null;
  company: { id: string; name: string; address: string | null; postalCode: string | null; city: string | null; phone: string | null };
  contract?: { id: string; reference: string };
  ticket?: { id: string; reference: string };
}

const TYPE_LABEL: Record<string, string> = {
  ONSITE: 'Sur site',
  REMOTE: 'A distance',
  PHONE: 'Telephone',
};

const STATUS_LABEL: Record<string, string> = {
  PLANNED: 'A faire',
  IN_PROGRESS: 'En cours',
  DONE: 'Terminee',
  CANCELLED: 'Annulee',
};

const STATUS_COLOR: Record<string, string> = {
  PLANNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  DONE: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

export default function FieldPage() {
  const [items, setItems] = useState<Intervention[]>([]);
  const [me, setMe] = useState<any>(null);
  const [filter, setFilter] = useState<'today' | 'week' | 'all'>('today');

  async function load() {
    const all = await api.get('/interventions');
    const u = await api.get('/users/me/profile');
    setMe(u);
    const filtered = (all as Intervention[]).filter((i) => {
      // Filtre user (uniquement les miens)
      // Note : le service backend ne filtre pas par user, on filtre cote client
      // pour un MVP. Au besoin, ajouter un filtre user au /interventions.
      if (filter === 'all') return true;
      const d = new Date(i.scheduledAt);
      const now = new Date();
      if (filter === 'today') {
        return d.toDateString() === now.toDateString();
      }
      // week
      const weekAhead = new Date(now.getTime() + 7 * 86400_000);
      return d >= now && d <= weekAhead;
    });
    // Tri : en cours en haut, puis a faire (date asc), puis terminees
    filtered.sort((a, b) => {
      const order: Record<string, number> = { IN_PROGRESS: 0, PLANNED: 1, DONE: 2, CANCELLED: 3 };
      const so = (order[a.status] ?? 99) - (order[b.status] ?? 99);
      if (so !== 0) return so;
      return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    });
    setItems(filtered);
  }

  useEffect(() => { load(); }, [filter]);
  useReloadOnFocus(load);

  async function action(id: string, action: 'start' | 'end') {
    try {
      const data = action === 'start'
        ? { status: 'IN_PROGRESS', startedAt: new Date().toISOString() }
        : { status: 'DONE', endedAt: new Date().toISOString() };
      await api.patch('/interventions/' + id, data);
      toast.success(action === 'start' ? 'Intervention demarree' : 'Intervention terminee');
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Wrench size={28} className="text-mdo-600" /> Mode terrain
          </h1>
          {me && <p className="text-sm text-slate-600 mt-1">{me.firstName} {me.lastName}</p>}
        </div>
      </div>

      <div className="flex gap-2">
        {(['today', 'week', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={'btn flex-1 ' + (filter === f ? 'btn-primary' : 'btn-secondary')}
          >
            {f === 'today' ? "Aujourd'hui" : f === 'week' ? '7 jours' : 'Tout'}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="card p-8 text-center text-slate-400">
            Aucune intervention {filter === 'today' ? "aujourd'hui" : filter === 'week' ? 'cette semaine' : ''}.
          </div>
        ) : items.map((it) => {
          const addr = [it.company.address, it.company.postalCode, it.company.city].filter(Boolean).join(', ');
          const mapsUrl = addr ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addr) : null;
          return (
            <div key={it.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className="font-bold text-lg leading-tight">{it.title}</h3>
                  <Link href={'/companies/' + it.company.id} className="text-mdo-600 hover:underline text-sm">{it.company.name}</Link>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                    <span><Clock size={11} className="inline" /> {formatDateTime(it.scheduledAt)}</span>
                    <span>· {TYPE_LABEL[it.type]}</span>
                  </div>
                </div>
                <span className={'badge ' + STATUS_COLOR[it.status]}>{STATUS_LABEL[it.status]}</span>
              </div>

              {it.description && (
                <p className="text-sm bg-slate-50 p-2 rounded text-slate-700">{it.description}</p>
              )}

              {/* Quick actions liens */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {it.company.phone && (
                  <a href={'tel:' + it.company.phone} className="btn btn-secondary flex-1 justify-center">
                    <Phone size={14} className="mr-1" /> Appeler
                  </a>
                )}
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noreferrer" className="btn btn-secondary flex-1 justify-center">
                    <MapPin size={14} className="mr-1" /> Itineraire
                  </a>
                )}
              </div>

              {/* Boutons d'action principaux (gros, pour usage tactile) */}
              <div className="flex gap-2">
                {it.status === 'PLANNED' && (
                  <button
                    onClick={() => action(it.id, 'start')}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-md font-semibold flex items-center justify-center gap-2 text-base"
                  >
                    <Play size={20} /> Demarrer
                  </button>
                )}
                {it.status === 'IN_PROGRESS' && (
                  <button
                    onClick={() => action(it.id, 'end')}
                    className="flex-1 bg-mdo-600 hover:bg-mdo-700 text-white py-3 rounded-md font-semibold flex items-center justify-center gap-2 text-base"
                  >
                    <CheckCircle2 size={20} /> Terminer
                  </button>
                )}
                <Link
                  href={'/interventions'}
                  className="btn btn-secondary py-3 px-4 text-base"
                  title="Voir le detail (compte-rendu, time entry, etc.)"
                >
                  <ChevronRight size={20} />
                </Link>
              </div>

              {it.startedAt && !it.endedAt && (
                <p className="text-xs text-amber-700">
                  En cours depuis {formatDateTime(it.startedAt)}
                  {' '}
                  ({Math.round((Date.now() - new Date(it.startedAt).getTime()) / 60000)} min)
                </p>
              )}
              {it.endedAt && it.durationMin && (
                <p className="text-xs text-emerald-700">
                  Duree : {Math.floor(it.durationMin / 60)}h{String(it.durationMin % 60).padStart(2, '0')}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
