'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Server, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatEuro } from '@/lib/utils';

interface Item {
  id: string;
  name: string;
  vendor: string | null;
  model: string | null;
  warrantyUntil: string | null;
  supportEndDate: string | null;
  acquiredAt: string | null;
  replacementBudgetHt: number | null;
  company: { id: string; name: string };
  lifecycle: {
    status: string;
    daysToWarrantyEnd: number | null;
    daysToSupportEnd: number | null;
    ageMonths: number | null;
  };
}

const STATUS_COLOR: Record<string, string> = {
  HEALTHY: 'bg-emerald-100 text-emerald-700',
  WARRANTY_EXPIRING: 'bg-amber-100 text-amber-700',
  OUT_OF_WARRANTY: 'bg-orange-100 text-orange-700',
  SUPPORT_ENDING: 'bg-amber-100 text-amber-700',
  EOSL: 'bg-red-100 text-red-700',
  NEEDS_REPLACEMENT: 'bg-red-100 text-red-700',
  UNKNOWN: 'bg-slate-100 text-slate-500',
};
const STATUS_LABEL: Record<string, string> = {
  HEALTHY: 'En bon etat',
  WARRANTY_EXPIRING: 'Garantie bientot',
  OUT_OF_WARRANTY: 'Hors garantie',
  SUPPORT_ENDING: 'Fin de support proche',
  EOSL: 'Fin de support depassee',
  NEEDS_REPLACEMENT: 'A remplacer',
  UNKNOWN: 'Non renseigne',
};

export default function AssetLifecyclePage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.get('/asset-lifecycle/stats').then(setStats);
  }, []);

  useEffect(() => {
    api.get('/asset-lifecycle' + (filter ? '?status=' + filter : '')).then(setItems);
  }, [filter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Server size={28} className="text-mdo-600" /> Lifecycle materiel
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Statut du parc HARDWARE : garantie, fin de support (EOSL), age, budget de remplacement.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div className="card p-3"><p className="text-xs text-slate-500">Total parc</p><p className="text-2xl font-bold">{stats.total}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">A remplacer</p><p className="text-2xl font-bold text-red-600">{stats.assetsToReplace}</p></div>
          <div className="card p-3 col-span-2"><p className="text-xs text-slate-500">Budget remplacement estime</p><p className="text-2xl font-bold">{formatEuro(stats.estimatedReplacementBudgetHt)}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">EOSL</p><p className="text-2xl font-bold text-red-600">{stats.counts.EOSL + stats.counts.NEEDS_REPLACEMENT}</p></div>
        </div>
      )}

      <div className="card p-4 flex items-center gap-3">
        <select className="input max-w-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Tous statuts</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {!items ? (
        <div className="text-slate-400">Chargement...</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-3 font-medium">Asset</th>
                <th className="p-3 font-medium">Client</th>
                <th className="p-3 font-medium">Vendor / model</th>
                <th className="p-3 font-medium">Age</th>
                <th className="p-3 font-medium">Garantie</th>
                <th className="p-3 font-medium">EOSL</th>
                <th className="p-3 font-medium">Budget remp.</th>
                <th className="p-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-t hover:bg-slate-50">
                  <td className="p-3 font-medium">{a.name}</td>
                  <td className="p-3">
                    <Link href={'/companies/' + a.company.id} className="text-mdo-600 hover:underline">{a.company.name}</Link>
                  </td>
                  <td className="p-3 text-xs text-slate-600">
                    {a.vendor ?? '-'}{a.model ? ' / ' + a.model : ''}
                  </td>
                  <td className="p-3 text-xs">{a.lifecycle.ageMonths != null ? a.lifecycle.ageMonths + ' mois' : '-'}</td>
                  <td className="p-3 text-xs">
                    {a.warrantyUntil ? (
                      <>
                        {formatDate(a.warrantyUntil)}
                        <div className="text-[10px] text-slate-400">
                          {a.lifecycle.daysToWarrantyEnd !== null && (a.lifecycle.daysToWarrantyEnd >= 0
                            ? 'dans ' + a.lifecycle.daysToWarrantyEnd + 'j'
                            : 'depuis ' + (-a.lifecycle.daysToWarrantyEnd) + 'j')}
                        </div>
                      </>
                    ) : '-'}
                  </td>
                  <td className="p-3 text-xs">
                    {a.supportEndDate ? (
                      <>
                        {formatDate(a.supportEndDate)}
                        <div className="text-[10px] text-slate-400">
                          {a.lifecycle.daysToSupportEnd !== null && (a.lifecycle.daysToSupportEnd >= 0
                            ? 'dans ' + a.lifecycle.daysToSupportEnd + 'j'
                            : 'depuis ' + (-a.lifecycle.daysToSupportEnd) + 'j')}
                        </div>
                      </>
                    ) : '-'}
                  </td>
                  <td className="p-3">{a.replacementBudgetHt ? formatEuro(a.replacementBudgetHt) : '-'}</td>
                  <td className="p-3">
                    <span className={'badge ' + (STATUS_COLOR[a.lifecycle.status] ?? 'bg-slate-100 text-slate-700')}>
                      {STATUS_LABEL[a.lifecycle.status] ?? a.lifecycle.status}
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
