'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableRowSkeleton } from '@/components/ui/Skeleton';
import { formatDate, formatEuro, quoteStatusColor, quoteStatusLabel } from '@/lib/utils';

interface Quote {
  id: string;
  reference: string;
  title: string;
  status: string;
  validUntil: string;
  totalTtc: number | string;
  company: { id: string; name: string };
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (status) p.set('status', status);
    api.get('/quotes' + (p.toString() ? '?' + p.toString() : ''))
      .then(setQuotes)
      .finally(() => setLoading(false));
  }, [search, status]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Devis</h1>
        <Link href="/quotes/new" className="btn btn-primary">
          <Plus size={16} className="mr-1" /> Nouveau devis
        </Link>
      </div>

      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Rechercher (titre, reference)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input max-w-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous statuts</option>
          <option value="DRAFT">Brouillon</option>
          <option value="SENT">Envoye</option>
          <option value="ACCEPTED">Accepte</option>
          <option value="REJECTED">Refuse</option>
          <option value="EXPIRED">Expire</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Reference</th>
              <th className="p-3 font-medium">Objet</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">Total TTC</th>
              <th className="p-3 font-medium">Valable jusqu'au</th>
              <th className="p-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={6} />)
            ) : quotes.length === 0 ? (
              <tr><td colSpan={6} className="p-0">
                <EmptyState
                  icon={FileText}
                  title="Aucun devis"
                  description={search || status ? "Aucun devis ne correspond aux filtres." : "Vos devis commerciaux apparaitront ici. Convertissez-les en contrat en 1 clic une fois acceptes."}
                  action={!search && !status ? (
                    <Link href="/quotes/new" className="btn btn-primary"><Plus size={16} className="mr-1" />Nouveau devis</Link>
                  ) : undefined}
                />
              </td></tr>
            ) : (
              quotes.map((q) => (
                <tr key={q.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="p-3">
                    <Link href={'/quotes/' + q.id} className="font-mono text-mdo-600 hover:underline">
                      {q.reference}
                    </Link>
                  </td>
                  <td className="p-3 truncate max-w-xs">{q.title}</td>
                  <td className="p-3">
                    <Link href={'/companies/' + q.company.id} className="text-mdo-600 hover:underline">
                      {q.company.name}
                    </Link>
                  </td>
                  <td className="p-3 font-medium">{formatEuro(q.totalTtc as any)}</td>
                  <td className="p-3">{formatDate(q.validUntil)}</td>
                  <td className="p-3">
                    <span className={'badge ' + quoteStatusColor[q.status]}>
                      {quoteStatusLabel[q.status]}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
