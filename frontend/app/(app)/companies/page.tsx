'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Building2 } from 'lucide-react';
import { api } from '@/lib/api';
import { companyStatusLabel, sectorLabel } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableRowSkeleton } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';

interface Company {
  id: string;
  name: string;
  sector: string;
  status: string;
  city: string | null;
  email: string | null;
  phone: string | null;
  owner: { firstName: string; lastName: string } | null;
  _count: { contacts: number; contracts: number; opportunities: number };
}

interface CompaniesPage {
  items: Company[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Reset a la page 1 quand search/status changent : sinon on peut se
  // retrouver sur la page 5 d'un filtre qui n'a qu'une page de resultats →
  // ecran vide trompeur.
  useEffect(() => {
    setPage(1);
  }, [search, status]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    params.set('page', String(page));
    api
      .get<CompaniesPage>('/companies?' + params.toString())
      .then((res) => {
        setCompanies(res.items);
        setPageCount(res.pageCount);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, [search, status, page]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Societes</h1>
        <Link href="/companies/new" className="btn btn-primary">
          <Plus size={16} className="mr-1" /> Nouvelle societe
        </Link>
      </div>

      <div className="card p-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input max-w-xs"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Tous statuts</option>
          <option value="LEAD">Lead</option>
          <option value="PROSPECT">Prospect</option>
          <option value="CUSTOMER">Client</option>
          <option value="INACTIVE">Inactif</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Nom</th>
              <th className="p-3 font-medium">Secteur</th>
              <th className="p-3 font-medium">Statut</th>
              <th className="p-3 font-medium">Ville</th>
              <th className="p-3 font-medium">Contacts</th>
              <th className="p-3 font-medium">Contrats</th>
              <th className="p-3 font-medium">Owner</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={7} />)
            ) : companies.length === 0 ? (
              <tr><td colSpan={7} className="p-0">
                <EmptyState
                  icon={Building2}
                  title="Aucune societe"
                  description={search || status ? "Aucune societe ne correspond aux filtres actifs." : "Commencez par ajouter votre premiere societe (prospect ou client)."}
                  action={!search && !status ? (
                    <Link href="/companies/new" className="btn btn-primary"><Plus size={16} className="mr-1" />Nouvelle societe</Link>
                  ) : undefined}
                />
              </td></tr>
            ) : (
              companies.map((c) => (
                <tr key={c.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="p-3">
                    <Link href={'/companies/' + c.id} className="font-medium text-mdo-600 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="p-3">{sectorLabel[c.sector]}</td>
                  <td className="p-3">
                    <span className="badge bg-slate-100 text-slate-700">
                      {companyStatusLabel[c.status]}
                    </span>
                  </td>
                  <td className="p-3">{c.city ?? '-'}</td>
                  <td className="p-3">{c._count.contacts}</td>
                  <td className="p-3">{c._count.contracts}</td>
                  <td className="p-3">
                    {c.owner ? c.owner.firstName + ' ' + c.owner.lastName : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          onChange={setPage}
          itemLabel="societe"
        />
      </div>
    </div>
  );
}
