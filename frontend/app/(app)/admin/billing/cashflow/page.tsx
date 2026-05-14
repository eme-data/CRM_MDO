'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Banknote, Calendar, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { formatEuro, formatDate } from '@/lib/utils';

interface CashFlowData {
  asOf: string;
  expectedIn: {
    next30Days: { count: number; totalTtc: number };
    next60Days: { count: number; totalTtc: number };
    next90Days: { count: number; totalTtc: number };
  };
  historical: {
    last30Days: {
      creditTotal: number;
      debitTotal: number;
      net: number;
      creditCount: number;
      debitCount: number;
    };
  };
  upcomingInvoices: Array<{
    id: string;
    number: string;
    companyName: string;
    dueDate: string;
    totalTtc: number;
    daysUntilDue: number;
  }>;
}

export default function CashFlowPage() {
  const [data, setData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/billing/cashflow')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="card p-6 animate-pulse h-64" />;
  if (!data) return <div className="card p-6 text-slate-500">Donnees indisponibles.</div>;

  const histo = data.historical.last30Days;

  return (
    <div className="space-y-6">
      <Link href="/admin/billing" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} className="mr-1" /> Retour admin billing
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Banknote size={28} /> Cash flow
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Encaissements attendus + flux historique Qonto · Mis a jour {formatDate(data.asOf)}
          </p>
        </div>
      </div>

      {/* Encaissements attendus 30/60/90j */}
      <div>
        <h2 className="font-semibold mb-3 flex items-center gap-2 text-slate-700 dark:text-slate-300">
          <Calendar size={16} /> Encaissements attendus
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <HorizonCard
            label="Prochains 30 jours"
            amount={data.expectedIn.next30Days.totalTtc}
            count={data.expectedIn.next30Days.count}
            tone="primary"
          />
          <HorizonCard
            label="Prochains 60 jours"
            amount={data.expectedIn.next60Days.totalTtc}
            count={data.expectedIn.next60Days.count}
            tone="secondary"
          />
          <HorizonCard
            label="Prochains 90 jours"
            amount={data.expectedIn.next90Days.totalTtc}
            count={data.expectedIn.next90Days.count}
            tone="secondary"
          />
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Base : factures ISSUED/OVERDUE non payees avec dueDate dans l'horizon. Pas de projection theorique des contrats — les factures pas encore emises ne sont pas comptees.
        </p>
      </div>

      {/* Historique Qonto 30j */}
      <div>
        <h2 className="font-semibold mb-3 flex items-center gap-2 text-slate-700 dark:text-slate-300">
          <TrendingUp size={16} /> Flux bancaire (30 derniers jours)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-4">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <ArrowDownRight size={16} />
              <span className="text-xs font-medium uppercase tracking-wide">Entrees</span>
            </div>
            <div className="text-2xl font-bold tabular-nums mt-1">{formatEuro(histo.creditTotal)}</div>
            <p className="text-xs text-slate-500 mt-0.5">{histo.creditCount} transaction{histo.creditCount > 1 ? 's' : ''} CREDIT</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <ArrowUpRight size={16} />
              <span className="text-xs font-medium uppercase tracking-wide">Sorties</span>
            </div>
            <div className="text-2xl font-bold tabular-nums mt-1">{formatEuro(histo.debitTotal)}</div>
            <p className="text-xs text-slate-500 mt-0.5">{histo.debitCount} transaction{histo.debitCount > 1 ? 's' : ''} DEBIT</p>
          </div>
          <div className={'card p-4 border-2 ' + (histo.net >= 0 ? 'border-emerald-300 dark:border-emerald-700' : 'border-red-300 dark:border-red-700')}>
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <Banknote size={16} />
              <span className="text-xs font-medium uppercase tracking-wide">Net</span>
            </div>
            <div className={'text-2xl font-bold tabular-nums mt-1 ' + (histo.net >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>
              {histo.net >= 0 ? '+' : ''}{formatEuro(histo.net)}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">CREDIT - DEBIT sur 30j</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Source : BankTransaction importees depuis Qonto. Activez la sync auto dans <Link href="/admin/billing" className="text-mdo-600 hover:underline">Admin Billing</Link> si vide.
        </p>
      </div>

      {/* Top echeances proches */}
      {data.upcomingInvoices.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold">Prochaines echeances</h2>
            <p className="text-xs text-slate-500 mt-0.5">Top 10 factures impayees avec dueDate &lt; 90 jours</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs">
              <tr>
                <th className="p-2 px-4 font-medium">N facture</th>
                <th className="p-2 px-4 font-medium">Client</th>
                <th className="p-2 px-4 font-medium">Echeance</th>
                <th className="p-2 px-4 font-medium">Dans</th>
                <th className="p-2 px-4 font-medium text-right">Montant TTC</th>
              </tr>
            </thead>
            <tbody>
              {data.upcomingInvoices.map((inv) => (
                <tr key={inv.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="p-2 px-4 font-mono">{inv.number}</td>
                  <td className="p-2 px-4">{inv.companyName}</td>
                  <td className="p-2 px-4 text-slate-500">{formatDate(inv.dueDate)}</td>
                  <td className="p-2 px-4">
                    {inv.daysUntilDue <= 7 ? (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        {inv.daysUntilDue}j
                      </span>
                    ) : (
                      <span className="text-slate-500">{inv.daysUntilDue}j</span>
                    )}
                  </td>
                  <td className="p-2 px-4 text-right font-medium tabular-nums">{formatEuro(inv.totalTtc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HorizonCard({ label, amount, count, tone }: { label: string; amount: number; count: number; tone: 'primary' | 'secondary' }) {
  const ring =
    tone === 'primary'
      ? 'border-2 border-mdo-300 dark:border-mdo-700 bg-mdo-50/40 dark:bg-mdo-950/20'
      : '';
  return (
    <div className={'card p-4 ' + ring}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="text-2xl font-bold tabular-nums mt-1">{formatEuro(amount)}</div>
      <p className="text-xs text-slate-500 mt-0.5">{count} facture{count > 1 ? 's' : ''} TTC</p>
    </div>
  );
}
