'use client';
import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Legend, CartesianGrid,
} from 'recharts';
import { api } from '@/lib/api';
import { formatEuro, stageLabel } from '@/lib/utils';

const STAGE_COLORS: Record<string, string> = {
  QUALIFICATION: '#94a3b8',
  PROPOSITION: '#3b82f6',
  NEGOCIATION: '#f59e0b',
  GAGNE: '#10b981',
  PERDU: '#ef4444',
};

export default function ReportsPage() {
  const [mrr, setMrr] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<any[]>([]);
  const [topClients, setTopClients] = useState<any[]>([]);
  const [sla, setSla] = useState<any>(null);
  const [pipeline, setPipeline] = useState<any[]>([]);
  const [timeByTech, setTimeByTech] = useState<any[]>([]);

  useEffect(() => {
    api.get('/reports/mrr-trend').then(setMrr);
    api.get('/reports/revenue-trend').then(setRevenue);
    api.get('/reports/top-clients').then(setTopClients);
    api.get('/reports/sla-respect').then(setSla);
    api.get('/reports/pipeline').then(setPipeline);
    api.get('/reports/time-by-tech').then(setTimeByTech);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Reporting</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="MRR actuel" value={mrr.length ? formatEuro(mrr[mrr.length - 1].mrrHt) : '—'} sub="HT mensuel" />
        <Stat
          label="SLA respecte (30j)"
          value={sla ? sla.ratePercent + ' %' : '—'}
          sub={sla ? sla.respected + '/' + sla.total + ' tickets' : ''}
          color={sla && sla.ratePercent < 80 ? 'text-red-600' : 'text-emerald-600'}
        />
        <Stat
          label="Pipeline ouvert"
          value={formatEuro(pipeline.filter((p) => !['GAGNE', 'PERDU'].includes(p.stage)).reduce((s, p) => s + p.totalHt, 0))}
          sub={pipeline.filter((p) => !['GAGNE', 'PERDU'].includes(p.stage)).reduce((s, p) => s + p.count, 0) + ' opportunites'}
        />
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-4">Evolution du MRR (12 derniers mois)</h2>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={mrr}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} />
            <Tooltip formatter={(v: number) => formatEuro(v)} />
            <Line type="monotone" dataKey="mrrHt" stroke="#1d4ed8" strokeWidth={2} name="MRR HT" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-4">CA facture (12 derniers mois)</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={revenue}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} />
            <Tooltip formatter={(v: number) => formatEuro(v)} />
            <Legend />
            <Bar dataKey="ht" fill="#1d4ed8" name="HT" />
            <Bar dataKey="ttc" fill="#60a5fa" name="TTC" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="font-semibold mb-4">Pipeline par etape</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={pipeline.map((p) => ({ ...p, label: stageLabel[p.stage] }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip formatter={(v: number, k: string) => k === 'totalHt' ? formatEuro(v) : v} />
              <Bar dataKey="totalHt" name="EUR HT">
                {pipeline.map((p, i) => (
                  <Cell key={i} fill={STAGE_COLORS[p.stage] ?? '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold mb-4">Temps technicien (30j)</h2>
          {timeByTech.length === 0 ? (
            <p className="text-slate-400 text-sm">Aucune saisie sur la periode</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={timeByTech} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} width={120} />
                <Tooltip formatter={(v: number) => Math.round(v / 60 * 10) / 10 + 'h'} />
                <Legend />
                <Bar dataKey="billableMin" fill="#10b981" name="Facturable" stackId="a" />
                <Bar dataKey="totalMin" fill="#94a3b8" name="Total" stackId="b" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold">Top clients par MRR</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-700 text-left">
            <tr>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">MRR HT</th>
              <th className="p-3 font-medium">Contrats</th>
              <th className="p-3 font-medium">Tickets total</th>
            </tr>
          </thead>
          <tbody>
            {topClients.length === 0 ? (
              <tr><td colSpan={4} className="p-6 text-center text-slate-400">Aucune donnee</td></tr>
            ) : topClients.map((c) => (
              <tr key={c.companyId} className="border-t border-slate-200 dark:border-slate-700">
                <td className="p-3 font-medium">{c.companyName}</td>
                <td className="p-3">{formatEuro(c.mrrHt)}</td>
                <td className="p-3">{c.contractCount}</td>
                <td className="p-3">{c.ticketCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, color = 'text-slate-700 dark:text-slate-200' }: any) {
  return (
    <div className="card p-5">
      <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
      <div className={'text-3xl font-bold mt-1 ' + color}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}
