'use client';
// Bloc charts isole de la page Reports pour permettre un import dynamique
// (next/dynamic) cote parent et exclure recharts (~150 KB gzippe) du bundle
// initial de l'app.
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatEuro, stageLabel } from '@/lib/utils';

const STAGE_COLORS: Record<string, string> = {
  QUALIFICATION: '#94a3b8',
  PROPOSITION: '#3b82f6',
  NEGOCIATION: '#f59e0b',
  GAGNE: '#10b981',
  PERDU: '#ef4444',
};

export interface ReportsChartsProps {
  mrr: any[];
  revenue: any[];
  pipeline: any[];
  timeByTech: any[];
}

export default function ReportsCharts({
  mrr,
  revenue,
  pipeline,
  timeByTech,
}: ReportsChartsProps) {
  return (
    <>
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
              <Tooltip formatter={(v: number, k: string) => (k === 'totalHt' ? formatEuro(v) : v)} />
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
                <Tooltip formatter={(v: number) => Math.round((v / 60) * 10) / 10 + 'h'} />
                <Legend />
                <Bar dataKey="billableMin" fill="#10b981" name="Facturable" stackId="a" />
                <Bar dataKey="totalMin" fill="#94a3b8" name="Total" stackId="b" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </>
  );
}
