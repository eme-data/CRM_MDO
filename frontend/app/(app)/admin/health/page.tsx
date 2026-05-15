'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { api } from '@/lib/api';
import { useReloadOnFocus } from '@/lib/useReloadOnFocus';

interface Check {
  category: string;
  key: string;
  label: string;
  status: 'ok' | 'info' | 'warning' | 'error';
  message: string;
  fixHint?: string;
  fixUrl?: string;
}

const STATUS_ICON: Record<string, any> = {
  ok: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
};
const STATUS_COLOR: Record<string, string> = {
  ok: 'text-emerald-600',
  info: 'text-blue-500',
  warning: 'text-amber-600',
  error: 'text-red-600',
};
const STATUS_BG: Record<string, string> = {
  ok: 'bg-emerald-50 border-emerald-200',
  info: 'bg-blue-50 border-blue-200',
  warning: 'bg-amber-50 border-amber-200',
  error: 'bg-red-50 border-red-200',
};

export default function HealthPage() {
  const [data, setData] = useState<{ issues: number; warnings: number; checks: Check[] } | null>(null);

  async function load() {
    try { setData(await api.get('/system-health')); }
    catch { /* ignore */ }
  }
  useEffect(() => { load(); }, []);
  useReloadOnFocus(load);

  if (!data) return <div>Chargement du health check...</div>;

  // Group by category
  const grouped = new Map<string, Check[]>();
  for (const c of data.checks) {
    if (!grouped.has(c.category)) grouped.set(c.category, []);
    grouped.get(c.category)!.push(c);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Activity size={28} className="text-mdo-600" /> Health check systeme
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Audit de configuration : detecte les settings manquants ou incoherents
          avant que ca ne genere des bugs en production.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className={'card p-4 ' + (data.issues > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200')}>
          <p className="text-xs text-slate-500">Erreurs critiques</p>
          <p className={'text-3xl font-bold ' + (data.issues > 0 ? 'text-red-600' : 'text-emerald-600')}>{data.issues}</p>
        </div>
        <div className={'card p-4 ' + (data.warnings > 0 ? 'bg-amber-50 border-amber-200' : '')}>
          <p className="text-xs text-slate-500">Avertissements</p>
          <p className={'text-3xl font-bold ' + (data.warnings > 0 ? 'text-amber-600' : 'text-emerald-600')}>{data.warnings}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-500">Total checks</p>
          <p className="text-3xl font-bold">{data.checks.length}</p>
        </div>
      </div>

      {Array.from(grouped.entries()).map(([category, checks]) => (
        <div key={category} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{category}</h2>
          <div className="space-y-2">
            {checks.map((c) => {
              const Icon = STATUS_ICON[c.status];
              return (
                <div key={c.key} className={'card p-3 border-l-4 ' + STATUS_BG[c.status]}>
                  <div className="flex items-start gap-3">
                    <Icon size={20} className={STATUS_COLOR[c.status] + ' shrink-0 mt-0.5'} />
                    <div className="flex-1">
                      <div className="font-medium">{c.label}</div>
                      <p className="text-sm text-slate-600 mt-0.5">{c.message}</p>
                      {c.fixHint && <p className="text-xs italic text-slate-500 mt-1">Fix : {c.fixHint}</p>}
                    </div>
                    {c.fixUrl && (
                      <Link href={c.fixUrl} className="btn btn-secondary text-xs py-1">Aller corriger</Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
