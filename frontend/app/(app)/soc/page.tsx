'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

interface Alert {
  id: string;
  source: string;
  severity: string;
  title: string;
  description: string | null;
  companyId: string | null;
  companyName: string | null;
  occurredAt: string;
  url: string | null;
  status: string | null;
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-200 text-red-800 border-red-400',
  HIGH: 'bg-red-100 text-red-700 border-red-200',
  MEDIUM: 'bg-amber-100 text-amber-700 border-amber-200',
  LOW: 'bg-blue-100 text-blue-700 border-blue-200',
  INFO: 'bg-slate-100 text-slate-700 border-slate-200',
};

const SOURCE_LABEL: Record<string, string> = {
  M365_DEFENDER: 'M365 Defender',
  UPTIME: 'Uptime',
  EMAIL_SECURITY: 'Email security',
  COMPLIANCE: 'Compliance',
  ASSET_LIFECYCLE: 'Hardware',
};

export default function SocPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [severity, setSeverity] = useState('');
  const [source, setSource] = useState('');

  async function load() {
    const p = new URLSearchParams();
    if (severity) p.set('severity', severity);
    if (source) p.set('sources', source);
    const [list, st] = await Promise.all([
      api.get('/soc/alerts' + (p.toString() ? '?' + p.toString() : '')),
      api.get('/soc/stats'),
    ]);
    setAlerts(list); setStats(st);
  }
  useEffect(() => { load(); }, [severity, source]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <ShieldAlert size={28} className="text-red-600" /> Console SOC
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Vue unifiee des alertes ouvertes : Defender M365, uptime, email security,
          compliance, lifecycle materiel. Triees par severite + date.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="card p-3"><p className="text-xs text-slate-500">Total ouvertes</p><p className="text-2xl font-bold">{stats.total}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Critical</p><p className="text-2xl font-bold text-red-700">{stats.counts.CRITICAL}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">High</p><p className="text-2xl font-bold text-red-600">{stats.counts.HIGH}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Medium</p><p className="text-2xl font-bold text-amber-600">{stats.counts.MEDIUM}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Low</p><p className="text-2xl font-bold text-blue-600">{stats.counts.LOW}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Info</p><p className="text-2xl font-bold text-slate-500">{stats.counts.INFO}</p></div>
        </div>
      )}

      <div className="card p-4 flex items-center gap-3">
        <select className="input max-w-xs" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">Toutes severites</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
          <option value="INFO">Info</option>
        </select>
        <select className="input max-w-xs" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Toutes sources</option>
          {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {alerts.length === 0 ? (
        <div className="card p-8 text-center text-emerald-600 font-semibold">
          Aucune alerte ouverte. Tout est OK.
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className={'card p-4 border-l-4 ' + SEV_COLOR[a.severity]}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={'badge ' + SEV_COLOR[a.severity]}>{a.severity}</span>
                    <span className="text-xs text-slate-500">{SOURCE_LABEL[a.source]}</span>
                    {a.companyName && (
                      <Link href={'/companies/' + a.companyId} className="text-xs text-mdo-600 hover:underline">
                        · {a.companyName}
                      </Link>
                    )}
                  </div>
                  <h3 className="font-semibold mt-1">
                    {a.url ? <Link href={a.url} className="hover:underline">{a.title}</Link> : a.title}
                  </h3>
                  {a.description && <p className="text-sm text-slate-600 mt-1">{a.description}</p>}
                  <div className="text-xs text-slate-400 mt-1">{formatDateTime(a.occurredAt)}{a.status && ' · ' + a.status}</div>
                </div>
                {a.severity === 'CRITICAL' && <AlertTriangle size={20} className="text-red-700 shrink-0" />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
