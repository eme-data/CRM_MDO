'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, AlertTriangle, LayoutGrid, List as ListIcon } from 'lucide-react';
import { api } from '@/lib/api';
import {
  formatDate,
  ticketStatusLabel,
  ticketStatusColor,
  ticketPriorityLabel,
  ticketPriorityColor,
  ticketCategoryLabel,
} from '@/lib/utils';

interface Ticket {
  id: string;
  reference: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  dueDate: string | null;
  createdAt: string;
  company: { id: string; name: string };
  contact: { firstName: string; lastName: string } | null;
  assignee: { id: string; firstName: string; lastName: string } | null;
}

const STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'];

export default function TicketsPage() {
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [kanban, setKanban] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (view === 'list') {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (priority) params.set('priority', priority);
      api.get('/tickets' + (params.toString() ? '?' + params.toString() : ''))
        .then(setTickets)
        .finally(() => setLoading(false));
    } else {
      setLoading(true);
      api.get('/tickets/kanban').then(setKanban).finally(() => setLoading(false));
    }
  }, [view, search, status, priority]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Tickets de support</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setView('list')}
            className={'btn ' + (view === 'list' ? 'btn-primary' : 'btn-secondary')}
          >
            <ListIcon size={16} className="mr-1" /> Liste
          </button>
          <button
            onClick={() => setView('kanban')}
            className={'btn ' + (view === 'kanban' ? 'btn-primary' : 'btn-secondary')}
          >
            <LayoutGrid size={16} className="mr-1" /> Kanban
          </button>
          <Link href="/tickets/new" className="btn btn-primary">
            <Plus size={16} className="mr-1" /> Nouveau ticket
          </Link>
        </div>
      </div>

      {view === 'list' && (
        <>
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
              {STATUSES.map((s) => (<option key={s} value={s}>{ticketStatusLabel[s]}</option>))}
            </select>
            <select className="input max-w-xs" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">Toutes priorites</option>
              <option value="URGENT">Urgente</option>
              <option value="HIGH">Haute</option>
              <option value="NORMAL">Normale</option>
              <option value="LOW">Basse</option>
            </select>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-3 font-medium">Reference</th>
                  <th className="p-3 font-medium">Titre</th>
                  <th className="p-3 font-medium">Client</th>
                  <th className="p-3 font-medium">Categorie</th>
                  <th className="p-3 font-medium">Priorite</th>
                  <th className="p-3 font-medium">Statut</th>
                  <th className="p-3 font-medium">Echeance</th>
                  <th className="p-3 font-medium">Assigne</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="p-6 text-center text-slate-400">Chargement...</td></tr>
                ) : tickets.length === 0 ? (
                  <tr><td colSpan={8} className="p-6 text-center text-slate-400">Aucun ticket</td></tr>
                ) : tickets.map((t) => {
                  const overdue = t.dueDate && new Date(t.dueDate) < new Date() && !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(t.status);
                  return (
                    <tr key={t.id} className="border-t hover:bg-slate-50">
                      <td className="p-3">
                        <Link href={'/tickets/' + t.id} className="font-mono text-mdo-600 hover:underline">
                          {t.reference}
                        </Link>
                      </td>
                      <td className="p-3 max-w-xs truncate">{t.title}</td>
                      <td className="p-3">
                        <Link href={'/companies/' + t.company.id} className="text-mdo-600 hover:underline">
                          {t.company.name}
                        </Link>
                      </td>
                      <td className="p-3">{ticketCategoryLabel[t.category]}</td>
                      <td className="p-3">
                        <span className={'badge ' + ticketPriorityColor[t.priority]}>
                          {ticketPriorityLabel[t.priority]}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={'badge ' + ticketStatusColor[t.status]}>
                          {ticketStatusLabel[t.status]}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          {t.dueDate ? formatDate(t.dueDate) : '-'}
                          {overdue && <span title="En retard"><AlertTriangle size={14} className="text-red-500" /></span>}
                        </div>
                      </td>
                      <td className="p-3">
                        {t.assignee ? t.assignee.firstName + ' ' + t.assignee.lastName : <span className="text-slate-400">Non assigne</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {kanban.map((col) => (
            <div key={col.status} className="card p-3">
              <div className="flex justify-between items-center mb-3">
                <span className={'badge ' + ticketStatusColor[col.status]}>
                  {ticketStatusLabel[col.status]}
                </span>
                <span className="text-xs text-slate-500">{col.count}</span>
              </div>
              <div className="space-y-2">
                {col.items.map((t: any) => (
                  <Link key={t.id} href={'/tickets/' + t.id} className="block rounded-md border border-slate-200 p-2 hover:bg-slate-50">
                    <div className="text-xs font-mono text-slate-500">{t.reference}</div>
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="text-xs text-slate-500 truncate mt-1">{t.company.name}</div>
                    <div className="mt-1 flex justify-between items-center">
                      <span className={'badge ' + ticketPriorityColor[t.priority]}>
                        {ticketPriorityLabel[t.priority]}
                      </span>
                      {t.assignee && (
                        <span className="text-xs text-slate-400">
                          {t.assignee.firstName[0]}{t.assignee.lastName[0]}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
