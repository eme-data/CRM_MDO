'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, DollarSign, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatEuro } from '@/lib/utils';

interface Item {
  companyId: string;
  name: string;
  contractRevenue: number;
  billableTimeRevenue: number;
  totalRevenue: number;
  internalCost: number;
  hoursBillable: number;
  hoursNonBillable: number;
  margin: number;
  marginPct: number;
  flag: 'PROFITABLE' | 'BREAK_EVEN' | 'LOSS';
}

const FLAG_COLOR: Record<string, string> = {
  PROFITABLE: 'bg-emerald-100 text-emerald-700',
  BREAK_EVEN: 'bg-amber-100 text-amber-700',
  LOSS: 'bg-red-100 text-red-700',
};

export default function ProfitabilityPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [months, setMonths] = useState(12);

  useEffect(() => {
    setItems(null);
    api.get('/profitability/overview?months=' + months).then(setItems);
  }, [months]);

  const totals = items?.reduce(
    (acc, i) => ({
      revenue: acc.revenue + i.totalRevenue,
      cost: acc.cost + i.internalCost,
      margin: acc.margin + i.margin,
    }),
    { revenue: 0, cost: 0, margin: 0 },
  );

  const lossCount = (items ?? []).filter((i) => i.flag === 'LOSS').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <DollarSign size={28} className="text-mdo-600" /> Marges et rentabilite par client
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Croise revenus contrats + facturation horaire vs cout interne (heures × taux technicien).
          Tri par marge croissante (les pertes en premier).
        </p>
      </div>

      <div className="card p-4 flex items-center gap-3">
        <label className="text-sm">Periode :</label>
        <select className="input max-w-xs" value={months} onChange={(e) => setMonths(parseInt(e.target.value))}>
          <option value={3}>3 mois</option>
          <option value={6}>6 mois</option>
          <option value={12}>12 mois</option>
          <option value={24}>24 mois</option>
        </select>
      </div>

      {totals && (
        <div className="grid grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-xs text-slate-500">Revenus totaux</p>
            <p className="text-2xl font-bold">{formatEuro(totals.revenue)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500">Couts internes</p>
            <p className="text-2xl font-bold">{formatEuro(totals.cost)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500">Marge totale</p>
            <p className={'text-2xl font-bold ' + (totals.margin >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {formatEuro(totals.margin)}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500">Clients en perte</p>
            <p className={'text-2xl font-bold ' + (lossCount > 0 ? 'text-red-600' : 'text-emerald-600')}>
              {lossCount}
            </p>
          </div>
        </div>
      )}

      {!items ? (
        <div className="text-slate-400">Calcul en cours...</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-3 font-medium">Client</th>
                <th className="p-3 font-medium text-right">Revenus contrats</th>
                <th className="p-3 font-medium text-right">Revenus horaires</th>
                <th className="p-3 font-medium text-right">Cout interne</th>
                <th className="p-3 font-medium text-right">Heures (B/NB)</th>
                <th className="p-3 font-medium text-right">Marge</th>
                <th className="p-3 font-medium text-right">Marge %</th>
                <th className="p-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.companyId} className="border-t hover:bg-slate-50">
                  <td className="p-3">
                    <Link href={'/companies/' + i.companyId} className="text-mdo-600 hover:underline">{i.name}</Link>
                  </td>
                  <td className="p-3 text-right">{formatEuro(i.contractRevenue)}</td>
                  <td className="p-3 text-right">{formatEuro(i.billableTimeRevenue)}</td>
                  <td className="p-3 text-right">{formatEuro(i.internalCost)}</td>
                  <td className="p-3 text-right text-xs">{i.hoursBillable.toFixed(0)} / {i.hoursNonBillable.toFixed(0)}</td>
                  <td className={'p-3 text-right font-medium ' + (i.margin >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                    {formatEuro(i.margin)}
                  </td>
                  <td className={'p-3 text-right font-bold ' + (i.marginPct >= 20 ? 'text-emerald-600' : i.marginPct < 0 ? 'text-red-600' : 'text-amber-600')}>
                    {i.marginPct >= 0 ? '+' : ''}{i.marginPct}%
                  </td>
                  <td className="p-3">
                    <span className={'badge inline-flex items-center gap-1 ' + FLAG_COLOR[i.flag]}>
                      {i.flag === 'PROFITABLE' && <TrendingUp size={10} />}
                      {i.flag === 'LOSS' && <TrendingDown size={10} />}
                      {i.flag === 'BREAK_EVEN' && <AlertTriangle size={10} />}
                      {i.flag}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
