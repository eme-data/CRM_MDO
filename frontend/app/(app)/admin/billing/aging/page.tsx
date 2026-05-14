'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, ExternalLink, Receipt } from 'lucide-react';
import { api } from '@/lib/api';
import { formatEuro, formatDate } from '@/lib/utils';

interface AgingInvoice {
  id: string;
  number: string;
  companyId: string;
  companyName: string;
  issueDate: string;
  dueDate: string;
  daysOverdue: number;
  totalHt: number;
  totalTtc: number;
  status: string;
  externalUrl: string | null;
}

interface AgingBucket {
  key: 'notDue' | 'd0_30' | 'd31_60' | 'd61_90' | 'd90plus';
  label: string;
  count: number;
  totalHt: number;
  totalTtc: number;
  invoices: AgingInvoice[];
}

interface AgingData {
  asOf: string;
  totals: { count: number; totalHt: number; totalTtc: number };
  buckets: AgingBucket[];
}

// Couleur d'urgence par bucket. notDue = neutre, retard croissant = degrade
// vers rouge. >90j = clignote conceptuellement (rouge fonce).
const BUCKET_STYLES: Record<AgingBucket['key'], { card: string; chip: string; bar: string }> = {
  notDue: { card: 'border-slate-200 dark:border-slate-700', chip: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', bar: 'bg-slate-300' },
  d0_30: { card: 'border-amber-200 dark:border-amber-800', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', bar: 'bg-amber-400' },
  d31_60: { card: 'border-orange-200 dark:border-orange-800', chip: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300', bar: 'bg-orange-500' },
  d61_90: { card: 'border-red-200 dark:border-red-800', chip: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', bar: 'bg-red-500' },
  d90plus: { card: 'border-red-400 dark:border-red-700', chip: 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200', bar: 'bg-red-700' },
};

export default function AgingReportPage() {
  const [data, setData] = useState<AgingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/invoices/aging')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="card p-6 animate-pulse h-64" />;
  }
  if (!data) {
    return <div className="card p-6 text-slate-500">Donnees indisponibles.</div>;
  }

  // Pourcentage de chaque bucket sur le total (pour la barre de proportion)
  const total = data.totals.totalHt || 1;

  return (
    <div className="space-y-6">
      <Link href="/admin/billing" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} className="mr-1" /> Retour admin billing
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Receipt size={28} /> Aging report
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Factures impayees groupees par anciennete · Mis a jour {formatDate(data.asOf)}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold tabular-nums">{formatEuro(data.totals.totalHt)}</div>
          <div className="text-sm text-slate-500">
            {data.totals.count} facture{data.totals.count > 1 ? 's' : ''} impayee{data.totals.count > 1 ? 's' : ''} (HT)
          </div>
        </div>
      </div>

      {/* Barre de proportion par bucket */}
      <div className="card p-4">
        <div className="flex h-3 rounded-full overflow-hidden">
          {data.buckets.map((b) => (
            <div
              key={b.key}
              className={BUCKET_STYLES[b.key].bar}
              style={{ width: (b.totalHt / total) * 100 + '%' }}
              title={b.label + ' : ' + formatEuro(b.totalHt) + ' HT'}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs">
          {data.buckets.map((b) => (
            <div key={b.key} className="flex items-center gap-2">
              <span className={'inline-block w-3 h-3 rounded ' + BUCKET_STYLES[b.key].bar} />
              <span className="text-slate-600 dark:text-slate-300">
                {b.label} : <span className="font-semibold">{b.count}</span>
                {b.totalHt > 0 && (
                  <span className="text-slate-400"> · {formatEuro(b.totalHt)} HT</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Detail par bucket */}
      {data.buckets.filter((b) => b.count > 0).map((b) => (
        <div key={b.key} className={'card border-l-4 ' + BUCKET_STYLES[b.key].card}>
          <div className="p-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold flex items-center gap-2">
                {b.key !== 'notDue' && <AlertTriangle size={16} className="text-amber-500" />}
                {b.label}
              </h2>
              <p className="text-sm text-slate-500">
                {b.count} facture{b.count > 1 ? 's' : ''} · {formatEuro(b.totalHt)} HT
              </p>
            </div>
            <span className={'px-2 py-1 rounded text-xs font-medium ' + BUCKET_STYLES[b.key].chip}>
              {b.count}
            </span>
          </div>
          <table className="w-full text-sm border-t">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs">
              <tr>
                <th className="p-2 px-4 font-medium">N facture</th>
                <th className="p-2 px-4 font-medium">Client</th>
                <th className="p-2 px-4 font-medium">Emise le</th>
                <th className="p-2 px-4 font-medium">Echeance</th>
                <th className="p-2 px-4 font-medium">Retard</th>
                <th className="p-2 px-4 font-medium text-right">Montant HT</th>
                <th className="p-2 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {b.invoices.map((inv) => (
                <tr key={inv.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="p-2 px-4 font-mono">{inv.number}</td>
                  <td className="p-2 px-4">
                    <Link href={'/companies/' + inv.companyId} className="text-mdo-600 hover:underline">
                      {inv.companyName}
                    </Link>
                  </td>
                  <td className="p-2 px-4 text-slate-500">{formatDate(inv.issueDate)}</td>
                  <td className="p-2 px-4 text-slate-500">{formatDate(inv.dueDate)}</td>
                  <td className="p-2 px-4">
                    {inv.daysOverdue > 0 ? (
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        {inv.daysOverdue}j
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="p-2 px-4 text-right font-medium tabular-nums">{formatEuro(inv.totalHt)}</td>
                  <td className="p-2 px-4">
                    {inv.externalUrl && (
                      <a
                        href={inv.externalUrl}
                        target="_blank"
                        rel="noopener"
                        className="text-mdo-600 hover:text-mdo-700"
                        title="Ouvrir dans le PDP (Sellsy / Qonto)"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {data.buckets.every((b) => b.count === 0) && (
        <div className="card p-12 text-center text-slate-500">
          <Receipt size={48} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Aucune facture impayee</p>
          <p className="text-sm mt-1">Toutes les factures emises ont ete reglees.</p>
        </div>
      )}
    </div>
  );
}
