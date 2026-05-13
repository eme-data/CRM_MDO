'use client';
import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { portalApi } from '@/lib/portal-api';
import { formatDate, formatEuro, contractOfferLabel, contractStatusLabel, contractStatusColor } from '@/lib/utils';

export default function PortalContractsPage() {
  const [contracts, setContracts] = useState<any[] | null>(null);

  useEffect(() => {
    portalApi.get('/contracts').then(setContracts).catch(() => setContracts([]));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mes contrats</h1>
        <p className="text-sm text-slate-500 mt-1">
          L'ensemble de vos contrats de prestation actifs et passes avec MDO Services.
        </p>
      </div>

      {contracts === null ? (
        <div className="text-slate-400">Chargement...</div>
      ) : contracts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-10 text-center">
          <FileText size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-600 dark:text-slate-300">Aucun contrat</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {contracts.map((c) => (
            <div key={c.id} className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400">{c.reference}</span>
                    <span className={'badge text-xs ' + contractStatusColor[c.status]}>
                      {contractStatusLabel[c.status]}
                    </span>
                  </div>
                  <h2 className="font-semibold mt-1">{c.title}</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {contractOfferLabel[c.offer]} · {c.quantity} utilisateur(s)
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold tabular-nums">
                    {formatEuro(c.monthlyAmountHt)}
                  </div>
                  <div className="text-xs text-slate-500">/ mois HT</div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Debut</p>
                  <p className="font-medium">{formatDate(c.startDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Fin</p>
                  <p className="font-medium">{formatDate(c.endDate)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
