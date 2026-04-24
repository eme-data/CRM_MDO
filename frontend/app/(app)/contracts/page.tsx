'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, Search, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import {
  formatEuro,
  formatDate,
  daysUntil,
  contractOfferLabel,
  contractStatusLabel,
  contractStatusColor,
} from '@/lib/utils';

interface Contract {
  id: string;
  reference: string;
  title: string;
  offer: string;
  status: string;
  startDate: string;
  endDate: string;
  monthlyAmountHt: number | string;
  quantity: number;
  company: { id: string; name: string };
}

export default function ContractsPage() {
  const sp = useSearchParams();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [expiringInDays, setExpiringInDays] = useState(sp.get('expiringInDays') ?? '');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (expiringInDays) params.set('expiringInDays', expiringInDays);
    api
      .get('/contracts' + (params.toString() ? '?' + params.toString() : ''))
      .then(setContracts)
      .finally(() => setLoading(false));
  }, [search, status, expiringInDays]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Contrats</h1>
        <Link href="/contracts/new" className="btn btn-primary">
          <Plus size={16} className="mr-1" /> Nouveau contrat
        </Link>
      </div>

      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input max-w-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous statuts</option>
          <option value="DRAFT">Brouillon</option>
          <option value="ACTIVE">Actif</option>
          <option value="SUSPENDED">Suspendu</option>
          <option value="EXPIRED">Expire</option>
          <option value="TERMINATED">Resilie</option>
          <option value="RENEWED">Renouvele</option>
        </select>
        <select
          className="input max-w-xs"
          value={expiringInDays}
          onChange={(e) => setExpiringInDays(e.target.value)}
        >
          <option value="">Echeance : toutes</option>
          <option value="30">Expire dans 30j</option>
          <option value="60">Expire dans 60j</option>
          <option value="90">Expire dans 90j</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Reference</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">Offre</th>
              <th className="p-3 font-medium">Qte</th>
              <th className="p-3 font-medium">Mensuel HT</th>
              <th className="p-3 font-medium">Debut</th>
              <th className="p-3 font-medium">Fin</th>
              <th className="p-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="p-6 text-center text-slate-400">Chargement...</td></tr>
            ) : contracts.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-slate-400">Aucun contrat</td></tr>
            ) : (
              contracts.map((c) => {
                const days = daysUntil(c.endDate);
                const warning = c.status === 'ACTIVE' && days <= 60;
                return (
                  <tr key={c.id} className="border-t hover:bg-slate-50">
                    <td className="p-3">
                      <Link href={'/contracts/' + c.id} className="font-mono text-mdo-600 hover:underline">
                        {c.reference}
                      </Link>
                    </td>
                    <td className="p-3">
                      <Link href={'/companies/' + c.company.id} className="text-mdo-600 hover:underline">
                        {c.company.name}
                      </Link>
                    </td>
                    <td className="p-3">{contractOfferLabel[c.offer]}</td>
                    <td className="p-3">{c.quantity}</td>
                    <td className="p-3 font-medium">{formatEuro(c.monthlyAmountHt as any)}</td>
                    <td className="p-3">{formatDate(c.startDate)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {formatDate(c.endDate)}
                        {warning && <AlertTriangle size={14} className="text-amber-500" title={days + ' jours restants'} />}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={'badge ' + contractStatusColor[c.status]}>
                        {contractStatusLabel[c.status]}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
