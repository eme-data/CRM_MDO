'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';

interface Item {
  companyId: string;
  name: string;
  overall: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  alerts: number;
}

const RISK_COLOR: Record<string, string> = {
  LOW: 'bg-emerald-100 text-emerald-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HIGH: 'bg-red-100 text-red-700',
};

export default function HealthOverviewPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM'>('ALL');

  useEffect(() => {
    api.get('/health-score/overview').then(setItems);
  }, []);

  const filtered = (items ?? []).filter((i) => filter === 'ALL' || i.risk === filter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Activity size={28} className="text-mdo-600" /> Sante des clients
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Score 0-100 par client agregant support, financier, engagement, NPS et cyber.
          Trie par risque (les plus a risque en premier).
        </p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setFilter('ALL')} className={'btn ' + (filter === 'ALL' ? 'btn-primary' : 'btn-secondary')}>Tous</button>
        <button onClick={() => setFilter('HIGH')} className={'btn ' + (filter === 'HIGH' ? 'btn-primary' : 'btn-secondary')}>Risque eleve</button>
        <button onClick={() => setFilter('MEDIUM')} className={'btn ' + (filter === 'MEDIUM' ? 'btn-primary' : 'btn-secondary')}>Vigilance</button>
      </div>

      {!items ? (
        <div className="text-slate-400">Chargement (calcul en cours, peut prendre 5-10s sur de gros catalogues)...</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-3 font-medium">Client</th>
                <th className="p-3 font-medium">Score</th>
                <th className="p-3 font-medium">Risque</th>
                <th className="p-3 font-medium">Alertes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4} className="p-6 text-center text-slate-400">Aucun client dans cette categorie.</td></tr>
              ) : filtered.map((i) => (
                <tr key={i.companyId} className="border-t hover:bg-slate-50">
                  <td className="p-3">
                    <Link href={'/companies/' + i.companyId} className="text-mdo-600 hover:underline">{i.name}</Link>
                  </td>
                  <td className="p-3 font-bold">{i.overall} / 100</td>
                  <td className="p-3"><span className={'badge ' + RISK_COLOR[i.risk]}>{i.risk}</span></td>
                  <td className="p-3">
                    {i.alerts > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-600">
                        <AlertTriangle size={12} /> {i.alerts}
                      </span>
                    )}
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
