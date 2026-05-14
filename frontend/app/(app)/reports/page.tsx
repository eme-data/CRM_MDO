'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { formatEuro } from '@/lib/utils';

// Charts isoles dans un bundle dynamique pour ne pas embarquer recharts
// (~150 KB gzippe) dans le bundle initial des autres pages.
const ReportsCharts = dynamic(() => import('./ReportsCharts'), {
  ssr: false,
  loading: () => (
    <div className="card p-6 text-sm text-slate-400">Chargement des graphiques...</div>
  ),
});

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

      <ReportsCharts mrr={mrr} revenue={revenue} pipeline={pipeline} timeByTech={timeByTech} />

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
