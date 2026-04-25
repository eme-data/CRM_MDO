'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus, Search, AlertTriangle, LayoutGrid, List as ListIcon, Trash2, UserCheck,
} from 'lucide-react';
import {
  DndContext, useDraggable, useDroppable,
  DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { toast } from 'sonner';
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
  const [users, setUsers] = useState<any[]>([]);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    if (selected.size === tickets.length && tickets.length > 0) setSelected(new Set());
    else setSelected(new Set(tickets.map((t) => t.id)));
  }

  // DnD kanban
  const [activeTicket, setActiveTicket] = useState<any | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function load() {
    setLoading(true);
    if (view === 'list') {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (priority) params.set('priority', priority);
      const r = await api.get('/tickets' + (params.toString() ? '?' + params.toString() : ''));
      setTickets(r);
    } else {
      setKanban(await api.get('/tickets/kanban'));
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [view, search, status, priority]);
  useEffect(() => { api.get('/users').then(setUsers); }, []);

  function findTicket(id: string) {
    for (const col of kanban) {
      const t = col.items.find((x: any) => x.id === id);
      if (t) return t;
    }
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    setActiveTicket(findTicket(String(e.active.id)));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveTicket(null);
    if (!e.over) return;
    const id = String(e.active.id);
    const targetStatus = String(e.over.id);
    const t = findTicket(id);
    if (!t || t.status === targetStatus) return;
    setKanban((prev) => prev.map((col) => ({
      ...col,
      items:
        col.status === t.status ? col.items.filter((x: any) => x.id !== id)
        : col.status === targetStatus ? [{ ...t, status: targetStatus }, ...col.items]
        : col.items,
    })));
    try {
      await api.patch('/tickets/' + id, { status: targetStatus });
      load();
    } catch (err: any) {
      toast.error(err.message);
      load();
    }
  }

  // Bulk actions
  async function bulkAssign(assigneeId: string) {
    if (selected.size === 0) return;
    await api.post('/tickets/bulk-update', { ids: Array.from(selected), assigneeId: assigneeId || null });
    toast.success(selected.size + ' ticket(s) reassignes');
    setSelected(new Set());
    load();
  }
  async function bulkStatus(s: string) {
    if (selected.size === 0) return;
    await api.post('/tickets/bulk-update', { ids: Array.from(selected), status: s });
    toast.success(selected.size + ' ticket(s) mis a jour');
    setSelected(new Set());
    load();
  }
  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm('Supprimer ' + selected.size + ' ticket(s) ?')) return;
    await api.post('/tickets/bulk-delete', { ids: Array.from(selected) });
    toast.success('Supprime');
    setSelected(new Set());
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Tickets de support</h1>
        <div className="flex gap-2">
          <button onClick={() => setView('list')} className={'btn ' + (view === 'list' ? 'btn-primary' : 'btn-secondary')}>
            <ListIcon size={16} className="mr-1" /> Liste
          </button>
          <button onClick={() => setView('kanban')} className={'btn ' + (view === 'kanban' ? 'btn-primary' : 'btn-secondary')}>
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
              <input className="input pl-9" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="input max-w-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Tous statuts</option>
              {STATUSES.map((s) => <option key={s} value={s}>{ticketStatusLabel[s]}</option>)}
            </select>
            <select className="input max-w-xs" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">Toutes priorites</option>
              <option value="URGENT">Urgente</option>
              <option value="HIGH">Haute</option>
              <option value="NORMAL">Normale</option>
              <option value="LOW">Basse</option>
            </select>
          </div>

          {selected.size > 0 && (
            <div className="card p-3 flex flex-wrap items-center gap-2 bg-mdo-50 dark:bg-mdo-900/20 border-mdo-200 dark:border-mdo-700">
              <span className="text-sm font-medium">{selected.size} selectionne(s)</span>
              <select className="input max-w-[180px] text-xs py-1" onChange={(e) => bulkStatus(e.target.value)} defaultValue="">
                <option value="" disabled>Changer statut</option>
                {STATUSES.map((s) => <option key={s} value={s}>{ticketStatusLabel[s]}</option>)}
              </select>
              <select className="input max-w-[180px] text-xs py-1" onChange={(e) => bulkAssign(e.target.value)} defaultValue="">
                <option value="" disabled>Assigner a...</option>
                <option value="">Non assigne</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
              <button onClick={bulkDelete} className="btn btn-danger text-xs py-1">
                <Trash2 size={12} className="mr-1" /> Supprimer
              </button>
              <button onClick={() => setSelected(new Set())} className="text-xs text-slate-500 hover:underline">Annuler</button>
            </div>
          )}

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700 text-left">
                <tr>
                  <th className="p-3 w-8">
                    <input
                      type="checkbox"
                      checked={tickets.length > 0 && selected.size === tickets.length}
                      onChange={toggleAll}
                    />
                  </th>
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
                  <tr><td colSpan={9} className="p-6 text-center text-slate-400">Chargement...</td></tr>
                ) : tickets.length === 0 ? (
                  <tr><td colSpan={9} className="p-6 text-center text-slate-400">Aucun ticket</td></tr>
                ) : tickets.map((t) => {
                  const overdue = t.dueDate && new Date(t.dueDate) < new Date() && !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(t.status);
                  return (
                    <tr key={t.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                      <td className="p-3">
                        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                      </td>
                      <td className="p-3">
                        <Link href={'/tickets/' + t.id} className="font-mono text-mdo-600 hover:underline">{t.reference}</Link>
                      </td>
                      <td className="p-3 max-w-xs truncate">{t.title}</td>
                      <td className="p-3">
                        <Link href={'/companies/' + t.company.id} className="text-mdo-600 hover:underline">{t.company.name}</Link>
                      </td>
                      <td className="p-3">{ticketCategoryLabel[t.category]}</td>
                      <td className="p-3"><span className={'badge ' + ticketPriorityColor[t.priority]}>{ticketPriorityLabel[t.priority]}</span></td>
                      <td className="p-3"><span className={'badge ' + ticketStatusColor[t.status]}>{ticketStatusLabel[t.status]}</span></td>
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
        <>
          <p className="text-xs text-slate-500">Glissez-deposez les cartes pour changer le statut.</p>
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {kanban.map((col) => <KanCol key={col.status} col={col} />)}
            </div>
            <DragOverlay>
              {activeTicket ? <TicketCard t={activeTicket} dragging /> : null}
            </DragOverlay>
          </DndContext>
        </>
      )}
    </div>
  );
}

function KanCol({ col }: { col: any }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.status });
  return (
    <div ref={setNodeRef} className={'card p-3 transition-colors ' + (isOver ? 'bg-mdo-50 dark:bg-mdo-900/20' : '')}>
      <div className="flex justify-between items-center mb-3">
        <span className={'badge ' + ticketStatusColor[col.status]}>{ticketStatusLabel[col.status]}</span>
        <span className="text-xs text-slate-500">{col.count}</span>
      </div>
      <div className="space-y-2 min-h-[80px]">
        {col.items.map((t: any) => <TicketCard key={t.id} t={t} />)}
      </div>
    </div>
  );
}

function TicketCard({ t, dragging }: { t: any; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: t.id });
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1 }
    : { opacity: isDragging ? 0.4 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={
        'rounded-md border border-slate-200 dark:border-slate-700 p-2 cursor-grab ' +
        (dragging ? 'bg-white shadow-xl' : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700')
      }
    >
      <div className="text-xs font-mono text-slate-500">{t.reference}</div>
      <div className="text-sm font-medium truncate">{t.title}</div>
      <div className="text-xs text-slate-500 truncate mt-1">{t.company?.name ?? ''}</div>
      <div className="mt-1 flex justify-between items-center">
        <span className={'badge ' + ticketPriorityColor[t.priority]}>{ticketPriorityLabel[t.priority]}</span>
        <Link
          href={'/tickets/' + t.id}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-xs text-mdo-600 hover:underline"
        >
          Ouvrir
        </Link>
      </div>
    </div>
  );
}
