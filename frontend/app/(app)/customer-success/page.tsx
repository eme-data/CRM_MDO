'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface Review {
  id: string;
  scheduledAt: string;
  status: string;
  heldAt: string | null;
  satisfactionScore: number | null;
  company: { id: string; name: string };
  owner?: { id: string; firstName: string; lastName: string } | null;
}

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

export default function CustomerSuccessPage() {
  const [items, setItems] = useState<Review[]>([]);
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);

  async function load() {
    setItems(await api.get('/customer-success' + (status ? '?status=' + status : '')));
  }
  useEffect(() => {
    load();
    api.get('/companies?pageSize=500').then((r) => setCompanies(r.items));
  }, [status]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    try {
      await api.post('/customer-success', {
        companyId: (f.elements.namedItem('companyId') as HTMLSelectElement).value,
        scheduledAt: (f.elements.namedItem('scheduledAt') as HTMLInputElement).value,
      });
      toast.success('Review programmee');
      setCreating(false);
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Calendar size={28} className="text-mdo-600" /> Customer Success — QBR
        </h1>
        <button onClick={() => setCreating(true)} className="btn btn-primary"><Plus size={16} className="mr-1" /> Nouvelle review</button>
      </div>

      <p className="text-sm text-slate-500">
        Revues trimestrielles automatiquement programmees pour chaque CUSTOMER actif.
        Le cron mensuel cree une review SCHEDULED si la derniere date de plus de 90 jours.
      </p>

      {creating && (
        <form onSubmit={submit} className="card p-6 space-y-3 border-mdo-200 bg-mdo-50">
          <h2 className="font-semibold">Programmer une review</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Societe</label>
              <select name="companyId" required className="input">
                <option value="">--</option>
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="label">Date prevue</label>
              <input name="scheduledAt" type="date" required className="input" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Programmer</button>
            <button type="button" onClick={() => setCreating(false)} className="btn btn-secondary">Annuler</button>
          </div>
        </form>
      )}

      <div className="card p-4 flex items-center gap-3">
        <select className="input max-w-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous statuts</option>
          <option value="SCHEDULED">A venir</option>
          <option value="COMPLETED">Tenues</option>
          <option value="CANCELLED">Annulees</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">Owner</th>
              <th className="p-3 font-medium">Tenue le</th>
              <th className="p-3 font-medium text-center">Satisfaction</th>
              <th className="p-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-slate-400">Aucune review.</td></tr>
            ) : items.map((r) => (
              <tr key={r.id} className="border-t hover:bg-slate-50">
                <td className="p-3"><Link href={'/customer-success/' + r.id} className="text-mdo-600 hover:underline font-medium">{formatDate(r.scheduledAt)}</Link></td>
                <td className="p-3"><Link href={'/companies/' + r.company.id} className="text-mdo-600 hover:underline">{r.company.name}</Link></td>
                <td className="p-3 text-xs">{r.owner ? r.owner.firstName + ' ' + r.owner.lastName : '-'}</td>
                <td className="p-3 text-xs">{r.heldAt ? formatDate(r.heldAt) : '-'}</td>
                <td className="p-3 text-center">{r.satisfactionScore !== null ? r.satisfactionScore + '/10' : '-'}</td>
                <td className="p-3"><span className={'badge ' + STATUS_COLOR[r.status]}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
