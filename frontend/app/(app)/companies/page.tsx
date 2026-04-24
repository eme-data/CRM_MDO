'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { companyStatusLabel, sectorLabel } from '@/lib/utils';

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

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    api
      .get('/companies' + (params.toString() ? '?' + params.toString() : ''))
      .then((res) => setCompanies(res.items))
      .finally(() => setLoading(false));
  }, [search, status]);

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
              <tr><td colSpan={7} className="p-6 text-center text-slate-400">Chargement...</td></tr>
            ) : companies.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-slate-400">Aucune societe</td></tr>
            ) : (
              companies.map((c) => (
                <tr key={c.id} className="border-t hover:bg-slate-50">
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
      </div>
    </div>
  );
}
