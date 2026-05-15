'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, Phone } from 'lucide-react';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableRowSkeleton } from '@/components/ui/Skeleton';
import { formatDateTime } from '@/lib/utils';

interface Call {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: string;
  fromNumber: string;
  toNumber: string;
  startedAt: string;
  durationSec?: number | null;
  contact?: { id: string; firstName: string; lastName: string };
  company?: { id: string; name: string };
  user?: { id: string; firstName: string; lastName: string };
}

const STATUS_COLOR: Record<string, string> = {
  RINGING: 'bg-blue-100 text-blue-700',
  ANSWERED: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  MISSED: 'bg-red-100 text-red-700',
  BUSY: 'bg-amber-100 text-amber-700',
  FAILED: 'bg-red-100 text-red-700',
};

function formatDuration(s?: number | null) {
  if (!s) return '-';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m + 'm' + String(sec).padStart(2, '0') + 's';
}

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [direction, setDirection] = useState<'' | 'INBOUND' | 'OUTBOUND'>('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    api.get('/calls/stats').then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.get('/calls' + (direction ? '?direction=' + direction : ''))
      .then(setCalls)
      .finally(() => setLoading(false));
  }, [direction]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Journal d'appels</h1>

      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-4"><p className="text-xs text-slate-500">Aujourd'hui</p><p className="text-2xl font-bold">{stats.today}</p></div>
          <div className="card p-4"><p className="text-xs text-slate-500">Manques entrants (jour)</p><p className="text-2xl font-bold text-red-600">{stats.todayMissedInbound}</p></div>
          <div className="card p-4"><p className="text-xs text-slate-500">7 derniers jours</p><p className="text-2xl font-bold">{stats.last7d}</p></div>
        </div>
      )}

      <div className="card p-4 flex flex-wrap items-center gap-3">
        <select className="input max-w-xs" value={direction} onChange={(e) => setDirection(e.target.value as any)}>
          <option value="">Tous les appels</option>
          <option value="INBOUND">Entrants</option>
          <option value="OUTBOUND">Sortants</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Sens</th>
              <th className="p-3 font-medium">De</th>
              <th className="p-3 font-medium">Vers</th>
              <th className="p-3 font-medium">Contact / Societe</th>
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Duree</th>
              <th className="p-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={7} />)
            ) : calls.length === 0 ? (
              <tr><td colSpan={7} className="p-0">
                <EmptyState icon={Phone} title="Aucun appel" description="Les appels apparaitront ici quand votre provider VoIP enverra des webhooks." />
              </td></tr>
            ) : (
              calls.map((c) => {
                const isMissed = c.status === 'MISSED' && c.direction === 'INBOUND';
                const Icon = isMissed ? PhoneMissed : c.direction === 'INBOUND' ? PhoneIncoming : PhoneOutgoing;
                const iconColor = isMissed ? 'text-red-500' : c.direction === 'INBOUND' ? 'text-blue-500' : 'text-emerald-500';
                return (
                  <tr key={c.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="p-3"><Icon size={16} className={iconColor} /></td>
                    <td className="p-3 font-mono text-xs">{c.fromNumber}</td>
                    <td className="p-3 font-mono text-xs">{c.toNumber}</td>
                    <td className="p-3">
                      {c.contact && (
                        <Link href={'/contacts/' + c.contact.id} className="text-mdo-600 hover:underline">
                          {c.contact.firstName} {c.contact.lastName}
                        </Link>
                      )}
                      {!c.contact && c.company && (
                        <Link href={'/companies/' + c.company.id} className="text-mdo-600 hover:underline">
                          {c.company.name}
                        </Link>
                      )}
                      {!c.contact && !c.company && <span className="text-slate-400">Inconnu</span>}
                    </td>
                    <td className="p-3 text-xs">{formatDateTime(c.startedAt)}</td>
                    <td className="p-3 text-xs">{formatDuration(c.durationSec)}</td>
                    <td className="p-3"><span className={'badge ' + (STATUS_COLOR[c.status] ?? 'bg-slate-100 text-slate-700')}>{c.status}</span></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
