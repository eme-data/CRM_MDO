'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

const STATUS_COLOR: Record<string, string> = {
  PLANNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  DONE: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-700',
};

export default function InterventionsPage() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api.get('/interventions').then(setItems); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Interventions</h1>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Titre</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Technicien</th>
              <th className="p-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-slate-400">Aucune intervention</td></tr>
            ) : items.map((i) => (
              <tr key={i.id} className="border-t hover:bg-slate-50">
                <td className="p-3">{formatDateTime(i.scheduledAt)}</td>
                <td className="p-3 font-medium">{i.title}</td>
                <td className="p-3">
                  {i.company && <Link href={'/companies/' + i.company.id} className="text-mdo-600 hover:underline">{i.company.name}</Link>}
                </td>
                <td className="p-3">{i.type}</td>
                <td className="p-3">{i.technician ? i.technician.firstName + ' ' + i.technician.lastName : '-'}</td>
                <td className="p-3"><span className={'badge ' + STATUS_COLOR[i.status]}>{i.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
