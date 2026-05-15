'use client';
import { useEffect, useState } from 'react';
import { Trophy, TrendingDown, Target } from 'lucide-react';
import { api } from '@/lib/api';
import { formatEuro } from '@/lib/utils';

interface Analysis {
  total: number;
  won: number;
  lost: number;
  winRatePct: number;
  wonAmount: number;
  lostAmount: number;
  avgDealSize: number;
  byLossReason: Array<{ reason: string; count: number; amount: number }>;
  byWinReason: Array<{ reason: string; count: number; amount: number }>;
  topCompetitors: Array<{ competitor: string; count: number; amount: number }>;
}

const LOSS_LABEL: Record<string, string> = {
  PRICE: 'Prix trop eleve',
  COMPETITOR: 'Concurrent retenu',
  TIMING: 'Mauvais timing',
  FEATURE: 'Fonctionnalite manquante',
  NO_RESPONSE: 'Pas de reponse',
  BUDGET: 'Pas de budget',
  PROJECT_CANCELLED: 'Projet annule',
  OTHER: 'Autre',
  UNSPECIFIED: 'Non renseigne',
};
const WIN_LABEL: Record<string, string> = {
  PRICE_LOWEST: 'Prix le plus bas',
  REPUTATION: 'Notoriete MDO',
  RELATIONSHIP: 'Relation existante',
  FEATURE: 'Fonctionnalite distinctive',
  PROXIMITY: 'Proximite / disponibilite',
  REFERRAL: 'Recommandation',
  OTHER: 'Autre',
  UNSPECIFIED: 'Non renseigne',
};

export default function WinLossPage() {
  const [data, setData] = useState<Analysis | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    api.get('/opportunities/win-loss-analysis' + (p.toString() ? '?' + p.toString() : '')).then(setData);
  }, [from, to]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Target size={28} className="text-mdo-600" /> Win / Loss analysis
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Analyse des opportunites cloturees (GAGNE / PERDU) avec motifs structures.
        </p>
      </div>

      <div className="card p-4 flex items-center gap-3">
        <label className="text-sm">Du :</label>
        <input type="date" className="input max-w-xs" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label className="text-sm">Au :</label>
        <input type="date" className="input max-w-xs" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {!data ? <div className="text-slate-400">Chargement...</div> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="card p-4"><p className="text-xs text-slate-500">Total cloturees</p><p className="text-2xl font-bold">{data.total}</p></div>
            <div className="card p-4 border-emerald-200 bg-emerald-50/50"><p className="text-xs text-slate-500">Gagnees</p><p className="text-2xl font-bold text-emerald-700">{data.won}</p></div>
            <div className="card p-4 border-red-200 bg-red-50/50"><p className="text-xs text-slate-500">Perdues</p><p className="text-2xl font-bold text-red-700">{data.lost}</p></div>
            <div className="card p-4"><p className="text-xs text-slate-500">Win rate</p><p className={'text-2xl font-bold ' + (data.winRatePct >= 50 ? 'text-emerald-600' : 'text-amber-600')}>{data.winRatePct}%</p></div>
            <div className="card p-4"><p className="text-xs text-slate-500">Deal moyen</p><p className="text-2xl font-bold">{formatEuro(data.avgDealSize)}</p></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Trophy size={16} className="text-emerald-600" /> Pourquoi on gagne ({formatEuro(data.wonAmount)})</h3>
              <table className="w-full text-sm">
                <thead><tr className="text-slate-500 text-left text-xs"><th>Motif</th><th className="text-right">Deals</th><th className="text-right">Montant</th></tr></thead>
                <tbody>
                  {data.byWinReason.length === 0 ? (
                    <tr><td colSpan={3} className="py-4 text-slate-400 text-center">Aucune donnee — pensez a renseigner le motif au passage en GAGNE</td></tr>
                  ) : data.byWinReason.map((r) => (
                    <tr key={r.reason} className="border-t">
                      <td className="py-2">{WIN_LABEL[r.reason]}</td>
                      <td className="py-2 text-right">{r.count}</td>
                      <td className="py-2 text-right font-medium">{formatEuro(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><TrendingDown size={16} className="text-red-600" /> Pourquoi on perd ({formatEuro(data.lostAmount)})</h3>
              <table className="w-full text-sm">
                <thead><tr className="text-slate-500 text-left text-xs"><th>Motif</th><th className="text-right">Deals</th><th className="text-right">Montant</th></tr></thead>
                <tbody>
                  {data.byLossReason.length === 0 ? (
                    <tr><td colSpan={3} className="py-4 text-slate-400 text-center">Aucune donnee — pensez a renseigner le motif au passage en PERDU</td></tr>
                  ) : data.byLossReason.map((r) => (
                    <tr key={r.reason} className="border-t">
                      <td className="py-2">{LOSS_LABEL[r.reason]}</td>
                      <td className="py-2 text-right">{r.count}</td>
                      <td className="py-2 text-right font-medium">{formatEuro(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.topCompetitors.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold mb-3">Concurrents qui nous prennent des deals</h3>
              <table className="w-full text-sm">
                <thead><tr className="text-slate-500 text-left text-xs"><th>Concurrent</th><th className="text-right">Deals perdus</th><th className="text-right">Montant cumule</th></tr></thead>
                <tbody>
                  {data.topCompetitors.map((c) => (
                    <tr key={c.competitor} className="border-t">
                      <td className="py-2 font-medium">{c.competitor}</td>
                      <td className="py-2 text-right">{c.count}</td>
                      <td className="py-2 text-right text-red-600">{formatEuro(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
