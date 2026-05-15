'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, Users, DollarSign, AlertTriangle, Crown, Activity } from 'lucide-react';
import { api } from '@/lib/api';
import { formatEuro, contractOfferLabel } from '@/lib/utils';

interface Snapshot {
  asOf: string;
  mrrHt: number;
  mrrPrevHt: number;
  mrrGrowthPct: number;
  arrHt: number;
  activeCustomers: number;
  newCustomers30d: number;
  arpu: number;
  newContracts30d: number;
  bookingsAmount30d: number;
  pipelineHt: number;
  quotesPipelineHt: number;
  terminatedCount30d: number;
  churnRatePct: number;
  totalContractRevenue12m: number;
  avgClientAgeMonths: number;
  ltv: number;
  topClientsMrr: Array<{ companyId: string; name: string; mrrHt: number; contracts: number }>;
  mrrByOffer: Array<{ offer: string; count: number; mrrHt: number }>;
}

export default function ExecutivePage() {
  const [s, setS] = useState<Snapshot | null>(null);

  useEffect(() => { api.get('/executive/snapshot').then(setS); }, []);

  if (!s) return <div>Calcul du snapshot exec...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Crown size={28} className="text-mdo-600" /> Dashboard exec MSP
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Snapshot business mensuel — mis a jour toutes les heures (cache).
          Snapshot du {new Date(s.asOf).toLocaleString('fr-FR')}.
        </p>
      </div>

      {/* ----- Revenus ----- */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase mb-2">Revenus recurrents</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card p-5 bg-gradient-to-br from-mdo-50 to-white border-mdo-200">
            <div className="text-xs text-slate-500">MRR actuel HT</div>
            <div className="text-3xl font-bold text-mdo-700 mt-1">{formatEuro(s.mrrHt)}</div>
            <div className="text-xs mt-2 flex items-center gap-1">
              {s.mrrGrowthPct >= 0 ? <TrendingUp size={12} className="text-emerald-600" /> : <TrendingDown size={12} className="text-red-600" />}
              <span className={s.mrrGrowthPct >= 0 ? 'text-emerald-600 font-medium' : 'text-red-600 font-medium'}>
                {s.mrrGrowthPct >= 0 ? '+' : ''}{s.mrrGrowthPct}%
              </span>
              <span className="text-slate-400">vs M-1 ({formatEuro(s.mrrPrevHt)})</span>
            </div>
          </div>
          <div className="card p-5">
            <div className="text-xs text-slate-500">ARR (annuel)</div>
            <div className="text-3xl font-bold mt-1">{formatEuro(s.arrHt)}</div>
            <div className="text-xs text-slate-400 mt-2">MRR × 12</div>
          </div>
          <div className="card p-5">
            <div className="text-xs text-slate-500">ARPU (HT/client/mois)</div>
            <div className="text-3xl font-bold mt-1">{formatEuro(s.arpu)}</div>
            <div className="text-xs text-slate-400 mt-2">MRR / clients actifs</div>
          </div>
          <div className="card p-5">
            <div className="text-xs text-slate-500">LTV estimee</div>
            <div className="text-3xl font-bold mt-1">{formatEuro(s.ltv)}</div>
            <div className="text-xs text-slate-400 mt-2">ARPU × age moyen ({s.avgClientAgeMonths} mois)</div>
          </div>
        </div>
      </div>

      {/* ----- Clients ----- */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase mb-2">Clients</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card p-5">
            <div className="text-xs text-slate-500 flex items-center gap-1"><Users size={12} /> Clients actifs</div>
            <div className="text-3xl font-bold mt-1">{s.activeCustomers}</div>
          </div>
          <div className="card p-5 border-emerald-200 bg-emerald-50/50">
            <div className="text-xs text-slate-500">Nouveaux clients (30j)</div>
            <div className="text-3xl font-bold text-emerald-700 mt-1">+{s.newCustomers30d}</div>
          </div>
          <div className="card p-5 border-red-200 bg-red-50/50">
            <div className="text-xs text-slate-500 flex items-center gap-1"><AlertTriangle size={12} /> Churn (30j)</div>
            <div className="text-3xl font-bold text-red-700 mt-1">{s.terminatedCount30d}</div>
            <div className="text-xs text-red-600 mt-2">{s.churnRatePct}% mensuel</div>
          </div>
          <div className="card p-5">
            <div className="text-xs text-slate-500">Age moyen client</div>
            <div className="text-3xl font-bold mt-1">{s.avgClientAgeMonths}</div>
            <div className="text-xs text-slate-400 mt-2">mois</div>
          </div>
        </div>
      </div>

      {/* ----- Pipeline & bookings ----- */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase mb-2">Activite commerciale</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card p-5">
            <div className="text-xs text-slate-500">Nouveaux contrats (30j)</div>
            <div className="text-3xl font-bold mt-1">{s.newContracts30d}</div>
            <div className="text-xs text-slate-400 mt-2">{formatEuro(s.bookingsAmount30d)} MRR ajoute</div>
          </div>
          <div className="card p-5">
            <div className="text-xs text-slate-500">Pipeline opportunites</div>
            <div className="text-3xl font-bold mt-1">{formatEuro(s.pipelineHt)}</div>
            <div className="text-xs text-slate-400 mt-2">pondere par probabilite</div>
          </div>
          <div className="card p-5">
            <div className="text-xs text-slate-500">Devis envoyes (en attente)</div>
            <div className="text-3xl font-bold mt-1">{formatEuro(s.quotesPipelineHt)}</div>
            <div className="text-xs text-slate-400 mt-2">total TTC</div>
          </div>
          <div className="card p-5">
            <div className="text-xs text-slate-500">Revenus contrats annualises</div>
            <div className="text-3xl font-bold mt-1">{formatEuro(s.totalContractRevenue12m)}</div>
            <div className="text-xs text-slate-400 mt-2">12 prochains mois</div>
          </div>
        </div>
      </div>

      {/* ----- Top clients & repartition par offre ----- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Crown size={16} /> Top 5 clients par MRR</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-slate-500 text-left text-xs"><th>Client</th><th className="text-right">MRR</th><th className="text-right">Contrats</th></tr></thead>
            <tbody>
              {s.topClientsMrr.map((c) => (
                <tr key={c.companyId} className="border-t">
                  <td className="py-2"><Link href={'/companies/' + c.companyId} className="text-mdo-600 hover:underline">{c.name}</Link></td>
                  <td className="py-2 text-right font-medium">{formatEuro(c.mrrHt)}</td>
                  <td className="py-2 text-right text-slate-500">{c.contracts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Activity size={16} /> MRR par offre</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-slate-500 text-left text-xs"><th>Offre</th><th className="text-right">Contrats</th><th className="text-right">MRR</th><th className="text-right">%</th></tr></thead>
            <tbody>
              {s.mrrByOffer.map((o) => (
                <tr key={o.offer} className="border-t">
                  <td className="py-2">{contractOfferLabel[o.offer] ?? o.offer}</td>
                  <td className="py-2 text-right">{o.count}</td>
                  <td className="py-2 text-right font-medium">{formatEuro(o.mrrHt)}</td>
                  <td className="py-2 text-right text-slate-500">{s.mrrHt > 0 ? Math.round((o.mrrHt / s.mrrHt) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
