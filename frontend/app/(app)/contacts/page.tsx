'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableRowSkeleton } from '@/components/ui/Skeleton';

export default function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = search ? '?search=' + encodeURIComponent(search) : '';
    api.get('/contacts' + params).then((res) => setContacts(res.items)).finally(() => setLoading(false));
  }, [search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Contacts</h1>
        <Link href="/contacts/new" className="btn btn-primary"><Plus size={16} className="mr-1" /> Nouveau contact</Link>
      </div>
      <div className="card p-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input className="input pl-9" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Nom</th>
              <th className="p-3 font-medium">Societe</th>
              <th className="p-3 font-medium">Poste</th>
              <th className="p-3 font-medium">Email</th>
              <th className="p-3 font-medium">Telephone</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={5} />)
            ) : contacts.length === 0 ? (
              <tr><td colSpan={5} className="p-0">
                <EmptyState
                  icon={Users}
                  title="Aucun contact"
                  description={search ? "Aucun contact ne correspond a votre recherche." : "Ajoutez vos premiers interlocuteurs chez vos clients et prospects."}
                  action={!search ? (
                    <Link href="/contacts/new" className="btn btn-primary"><Plus size={16} className="mr-1" />Nouveau contact</Link>
                  ) : undefined}
                />
              </td></tr>
            ) : contacts.map((c) => (
              <tr key={c.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <td className="p-3">
                  <Link href={'/contacts/' + c.id} className="font-medium text-mdo-600 hover:underline">
                    {c.firstName} {c.lastName}
                  </Link>
                  {c.isPrimary && <span className="ml-2 badge bg-amber-100 text-amber-700">Principal</span>}
                </td>
                <td className="p-3">
                  {c.company ? <Link href={'/companies/' + c.company.id} className="text-mdo-600 hover:underline">{c.company.name}</Link> : '-'}
                </td>
                <td className="p-3">{c.position ?? '-'}</td>
                <td className="p-3">{c.email ?? '-'}</td>
                <td className="p-3">{c.phone ?? c.mobile ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
