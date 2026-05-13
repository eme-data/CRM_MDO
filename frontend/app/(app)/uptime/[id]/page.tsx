'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Activity, ArrowLeft, RefreshCw, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface Monitor {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  method: string;
  expectedStatus: number;
  intervalMinutes: number;
  lastCheckedAt: string | null;
  lastStatus: 'UP' | 'DOWN' | null;
  company: { id: string; name: string } | null;
}

interface Check {
  id: string;
  checkedAt: string;
  isUp: boolean;
  httpCode: number | null;
  responseMs: number | null;
  error: string | null;
}

interface Incident {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  reason: string | null;
}

interface Detail {
  monitor: Monitor;
  recentChecks: Check[];
  openIncidents: Incident[];
  recentIncidents: Incident[];
  uptime24h: number | null;
}

function fmtDuration(sec: number) {
  if (sec < 60) return sec + 's';
  if (sec < 3600) return Math.floor(sec / 60) + 'min';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h + 'h' + (m > 0 ? m + 'min' : '');
}

export default function UptimeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<Detail | null>(null);

  async function load() {
    try {
      setData(await api.get('/uptime/' + id));
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function checkNow() {
    if (!data) return;
    const t = toast.loading('Verification...');
    try {
      const r = await api.post('/uptime/' + id + '/check');
      toast.dismiss(t);
      if (r.isUp) toast.success('UP - HTTP ' + r.httpCode + ' (' + r.responseMs + 'ms)');
      else toast.error('DOWN - ' + (r.error ?? 'erreur'));
      load();
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err.message);
    }
  }

  if (!data) return <div>Chargement...</div>;

  const m = data.monitor;
  const last30 = data.recentChecks.slice(0, 30).reverse();
  const maxLatency = Math.max(...last30.map((c) => c.responseMs ?? 0), 100);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/uptime" className="text-sm text-mdo-600 hover:underline inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Retour
        </Link>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="text-mdo-500" /> {m.name}
          </h1>
          <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-sm font-mono text-slate-500 hover:underline">{m.url}</a>
          {m.company && (
            <p className="text-sm mt-1">Client : <Link href={'/companies/' + m.company.id} className="text-mdo-600 hover:underline">{m.company.name}</Link></p>
          )}
        </div>
        <button onClick={checkNow} className="btn btn-primary">
          <RefreshCw size={16} className="mr-1" /> Verifier maintenant
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-sm text-slate-500">Statut</p>
          <p className={'text-xl font-bold ' + (m.lastStatus === 'UP' ? 'text-emerald-600' : m.lastStatus === 'DOWN' ? 'text-red-600' : 'text-slate-400')}>
            {m.lastStatus ?? 'inconnu'}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Uptime 24h</p>
          <p className="text-xl font-bold">{data.uptime24h !== null ? data.uptime24h.toFixed(2) + ' %' : '-'}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Incidents en cours</p>
          <p className={'text-xl font-bold ' + (data.openIncidents.length > 0 ? 'text-red-600' : 'text-emerald-600')}>
            {data.openIncidents.length}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Dernier check</p>
          <p className="text-sm font-medium">{m.lastCheckedAt ? formatDate(m.lastCheckedAt) : 'jamais'}</p>
        </div>
      </div>

      {/* Mini-graphique */}
      {last30.length > 0 && (
        <div className="card p-4">
          <p className="text-sm font-medium mb-2">30 derniers checks (latence ms)</p>
          <div className="flex items-end gap-0.5 h-24">
            {last30.map((c) => {
              const h = c.isUp ? Math.max(4, Math.round(((c.responseMs ?? 0) / maxLatency) * 96)) : 96;
              return (
                <div
                  key={c.id}
                  className={'flex-1 rounded-t ' + (c.isUp ? 'bg-emerald-400' : 'bg-red-500')}
                  style={{ height: h + 'px' }}
                  title={
                    formatDate(c.checkedAt) +
                    ' - ' +
                    (c.isUp ? 'UP ' + c.responseMs + 'ms (HTTP ' + c.httpCode + ')' : 'DOWN ' + (c.error ?? ''))
                  }
                />
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1">
            <span>{formatDate(last30[0].checkedAt)}</span>
            <span>{formatDate(last30[last30.length - 1].checkedAt)}</span>
          </div>
        </div>
      )}

      {/* Incidents en cours */}
      {data.openIncidents.length > 0 && (
        <div className="card p-5 border-l-4 border-red-500">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="text-red-500" size={18} />
            <h2 className="font-semibold">Incident en cours</h2>
          </div>
          {data.openIncidents.map((inc) => {
            const dur = Math.floor((Date.now() - new Date(inc.startedAt).getTime()) / 1000);
            return (
              <div key={inc.id} className="text-sm">
                <p>Depuis {formatDate(inc.startedAt)} (<strong>{fmtDuration(dur)}</strong>)</p>
                {inc.reason && <p className="text-red-600 mt-1">{inc.reason}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Historique incidents */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold">Historique incidents (20 derniers)</h2>
        </div>
        {data.recentIncidents.length === 0 ? (
          <p className="p-6 text-center text-slate-400 text-sm">Aucun incident historique.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700 text-left">
              <tr>
                <th className="p-3 font-medium">Debut</th>
                <th className="p-3 font-medium">Fin</th>
                <th className="p-3 font-medium">Duree</th>
                <th className="p-3 font-medium">Cause</th>
              </tr>
            </thead>
            <tbody>
              {data.recentIncidents.map((inc) => (
                <tr key={inc.id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="p-3">{formatDate(inc.startedAt)}</td>
                  <td className="p-3">{inc.endedAt ? formatDate(inc.endedAt) : <span className="text-red-600">en cours</span>}</td>
                  <td className="p-3">{inc.durationSeconds ? fmtDuration(inc.durationSeconds) : '-'}</td>
                  <td className="p-3 text-xs">{inc.reason ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Liste detaillee des derniers checks */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold">Derniers checks ({data.recentChecks.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-700 text-left">
            <tr>
              <th className="p-3 font-medium">Quand</th>
              <th className="p-3 font-medium">Statut</th>
              <th className="p-3 font-medium">HTTP</th>
              <th className="p-3 font-medium">Latence</th>
              <th className="p-3 font-medium">Erreur</th>
            </tr>
          </thead>
          <tbody>
            {data.recentChecks.slice(0, 50).map((c) => (
              <tr key={c.id} className="border-t border-slate-200 dark:border-slate-700">
                <td className="p-3 text-xs">{formatDate(c.checkedAt)}</td>
                <td className="p-3">
                  {c.isUp
                    ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={14} /> UP</span>
                    : <span className="inline-flex items-center gap-1 text-red-600"><XCircle size={14} /> DOWN</span>
                  }
                </td>
                <td className="p-3 font-mono text-xs">{c.httpCode ?? '-'}</td>
                <td className="p-3 text-xs">{c.responseMs != null ? c.responseMs + ' ms' : '-'}</td>
                <td className="p-3 text-xs text-red-500">{c.error ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
