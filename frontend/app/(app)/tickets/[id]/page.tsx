'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Trash2,
  Lock,
  Send,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  formatDate,
  formatDateTime,
  ticketStatusLabel,
  ticketStatusColor,
  ticketPriorityLabel,
  ticketPriorityColor,
  ticketCategoryLabel,
  ticketChannelLabel,
} from '@/lib/utils';

const STATUS_FLOW = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'];

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [ticket, setTicket] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [posting, setPosting] = useState(false);

  async function load() {
    setTicket(await api.get('/tickets/' + id));
  }

  useEffect(() => {
    load();
    api.get('/users').then(setUsers);
  }, [id]);

  async function changeStatus(status: string) {
    await api.patch('/tickets/' + id, { status });
    toast.success('Statut mis a jour');
    load();
  }

  async function changePriority(priority: string) {
    await api.patch('/tickets/' + id, { priority });
    toast.success('Priorite mise a jour');
    load();
  }

  async function changeAssignee(assigneeId: string) {
    await api.patch('/tickets/' + id, { assigneeId: assigneeId || null });
    toast.success('Assignation mise a jour');
    load();
  }

  async function submitMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setPosting(true);
    try {
      await api.post('/tickets/' + id + '/messages', { content: newMessage, isInternal });
      setNewMessage('');
      setIsInternal(false);
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Supprimer ce ticket ?')) return;
    await api.delete('/tickets/' + id);
    toast.success('Ticket supprime');
    router.replace('/tickets');
  }

  if (!ticket) return <div>Chargement...</div>;

  const overdue = ticket.dueDate && new Date(ticket.dueDate) < new Date()
    && !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(ticket.status);

  return (
    <div className="space-y-6">
      <Link href="/tickets" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} className="mr-1" /> Retour aux tickets
      </Link>

      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold font-mono">{ticket.reference}</h1>
            <span className={'badge ' + ticketStatusColor[ticket.status]}>
              {ticketStatusLabel[ticket.status]}
            </span>
            <span className={'badge ' + ticketPriorityColor[ticket.priority]}>
              {ticketPriorityLabel[ticket.priority]}
            </span>
            <span className="badge bg-slate-100 text-slate-700">
              {ticketCategoryLabel[ticket.category]}
            </span>
          </div>
          <h2 className="text-xl mt-2">{ticket.title}</h2>
          <Link href={'/companies/' + ticket.company.id} className="text-mdo-600 hover:underline text-sm">
            {ticket.company.name}
          </Link>
        </div>
        <button onClick={handleDelete} className="btn btn-danger">
          <Trash2 size={16} className="mr-1" /> Supprimer
        </button>
      </div>

      {overdue && (
        <div className="card p-4 border-red-200 bg-red-50 flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-500" />
          <p className="text-sm">
            Ticket <strong>en retard</strong> - echeance prevue le {formatDate(ticket.dueDate)}.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <h3 className="font-semibold mb-2">Description</h3>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.description}</p>
          </div>

          <div className="card p-6">
            <h3 className="font-semibold mb-4">Conversation ({ticket.messages.length})</h3>
            <div className="space-y-4 mb-6">
              {ticket.messages.length === 0 ? (
                <p className="text-slate-400 text-sm">Aucun message pour l'instant</p>
              ) : ticket.messages.map((m: any) => (
                <div
                  key={m.id}
                  className={'rounded-lg p-4 border ' + (m.isInternal ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200')}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-sm font-medium">
                      {m.author ? m.author.firstName + ' ' + m.author.lastName : (m.authorName ?? 'Externe')}
                      {m.isInternal && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-700">
                          <Lock size={12} /> Note interne
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">{formatDateTime(m.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{m.content}</p>
                </div>
              ))}
            </div>

            <form onSubmit={submitMessage} className="space-y-2 border-t pt-4">
              <textarea
                className="input min-h-[100px]"
                placeholder="Repondre..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
              />
              <div className="flex justify-between items-center">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                  />
                  Note interne (non visible client)
                </label>
                <button type="submit" disabled={posting || !newMessage.trim()} className="btn btn-primary">
                  <Send size={14} className="mr-1" /> {posting ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <h3 className="font-semibold text-sm">Statut</h3>
            <div className="space-y-2">
              {STATUS_FLOW.map((s) => (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  className={
                    'w-full text-left px-3 py-2 rounded-md text-sm border ' +
                    (ticket.status === s
                      ? 'border-mdo-500 bg-mdo-50 text-mdo-700 font-medium'
                      : 'border-slate-200 hover:bg-slate-50')
                  }
                >
                  {ticket.status === s && <CheckCircle2 size={14} className="inline mr-2" />}
                  {ticketStatusLabel[s]}
                </button>
              ))}
              <button
                onClick={() => changeStatus('CANCELLED')}
                className="w-full text-left px-3 py-2 rounded-md text-sm text-red-700 hover:bg-red-50"
              >
                Annuler
              </button>
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <h3 className="font-semibold text-sm">Priorite</h3>
            <select className="input" value={ticket.priority} onChange={(e) => changePriority(e.target.value)}>
              <option value="LOW">Basse</option>
              <option value="NORMAL">Normale</option>
              <option value="HIGH">Haute</option>
              <option value="URGENT">Urgente</option>
            </select>
          </div>

          <div className="card p-4 space-y-3">
            <h3 className="font-semibold text-sm">Assigne</h3>
            <select className="input" value={ticket.assigneeId ?? ''} onChange={(e) => changeAssignee(e.target.value)}>
              <option value="">Non assigne</option>
              {users.map((u) => (<option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>))}
            </select>
          </div>

          <div className="card p-4 text-sm space-y-2">
            <h3 className="font-semibold">Informations</h3>
            <Info label="Canal" value={ticketChannelLabel[ticket.channel]} />
            <Info label="Contact" value={ticket.contact ? ticket.contact.firstName + ' ' + ticket.contact.lastName : '-'} />
            <Info label="Contrat" value={ticket.contract ? <Link className="text-mdo-600 hover:underline" href={'/contracts/' + ticket.contract.id}>{ticket.contract.reference}</Link> : '-'} />
            <Info label="Echeance" value={ticket.dueDate ? formatDate(ticket.dueDate) : '-'} />
            <Info label="Cree par" value={ticket.createdBy.firstName + ' ' + ticket.createdBy.lastName} />
            <Info label="Cree le" value={formatDateTime(ticket.createdAt)} />
            <Info label="1ere reponse" value={ticket.firstResponseAt ? formatDateTime(ticket.firstResponseAt) : '-'} />
            <Info label="Resolu le" value={ticket.resolvedAt ? formatDateTime(ticket.resolvedAt) : '-'} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="text-right">{value ?? '-'}</span>
    </div>
  );
}
