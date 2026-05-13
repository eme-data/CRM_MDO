'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Send, User as UserIcon, Briefcase } from 'lucide-react';
import { portalApi } from '@/lib/portal-api';
import { formatDateTime, ticketStatusLabel, ticketStatusColor } from '@/lib/utils';

export default function PortalTicketDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [ticket, setTicket] = useState<any>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  async function load() {
    const t = await portalApi.get('/tickets/' + id);
    setTicket(t);
  }
  useEffect(() => { load(); }, [id]);

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      await portalApi.post('/tickets/' + id + '/messages', { content: reply });
      setReply('');
      await load();
    } finally {
      setSending(false);
    }
  }

  if (!ticket) return <div className="text-slate-400">Chargement...</div>;

  const isClosed = ['RESOLVED', 'CLOSED', 'CANCELLED'].includes(ticket.status);

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/portal/tickets" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} className="mr-1" /> Retour
      </Link>

      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-mono text-slate-400">{ticket.reference}</span>
          <span className={'badge text-xs ' + ticketStatusColor[ticket.status]}>
            {ticketStatusLabel[ticket.status]}
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{ticket.title}</h1>
        <p className="text-xs text-slate-500 mt-1">
          Cree le {formatDateTime(ticket.createdAt)}
          {ticket.assignee && ` · pris en charge par ${ticket.assignee.firstName} ${ticket.assignee.lastName}`}
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-semibold mb-3">Description initiale</h2>
        <p className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300">{ticket.description}</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-semibold mb-4">Conversation</h2>
        {ticket.messages.length === 0 ? (
          <p className="text-sm text-slate-400 italic">Aucun message pour le moment.</p>
        ) : (
          <div className="space-y-4">
            {ticket.messages.map((m: any) => {
              const isFromMDO = !!m.author;
              return (
                <div key={m.id} className={'flex gap-3 ' + (isFromMDO ? '' : 'flex-row-reverse')}>
                  <div className={
                    'h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ' +
                    (isFromMDO ? 'bg-mdo-100 text-mdo-700' : 'bg-slate-200 text-slate-700')
                  }>
                    {isFromMDO ? <Briefcase size={14} /> : <UserIcon size={14} />}
                  </div>
                  <div className={'flex-1 max-w-[80%] ' + (isFromMDO ? '' : 'text-right')}>
                    <div className="text-xs text-slate-500 mb-1">
                      {isFromMDO
                        ? `${m.author.firstName} ${m.author.lastName} (MDO Services)`
                        : 'Vous'}
                      {' · '}
                      {formatDateTime(m.createdAt)}
                    </div>
                    <div className={
                      'inline-block rounded-lg p-3 text-sm whitespace-pre-wrap text-left ' +
                      (isFromMDO
                        ? 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700'
                        : 'bg-mdo-50 dark:bg-mdo-900/30 border border-mdo-200 dark:border-mdo-800')
                    }>
                      {m.content}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isClosed && (
          <form onSubmit={sendReply} className="mt-6 space-y-3">
            <label className="block text-sm font-medium">Repondre</label>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Votre reponse..."
              className="w-full min-h-[100px] rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:border-mdo-500 focus:outline-none focus:ring-1 focus:ring-mdo-500"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={sending || !reply.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-mdo-600 text-white px-4 py-2 text-sm font-medium hover:bg-mdo-700 disabled:opacity-50"
              >
                <Send size={14} /> {sending ? 'Envoi...' : 'Envoyer'}
              </button>
            </div>
          </form>
        )}
        {isClosed && (
          <div className="mt-6 rounded-md bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-500 text-center">
            Ce ticket est {ticketStatusLabel[ticket.status].toLowerCase()}. Pour une nouvelle demande, creez un nouveau ticket.
          </div>
        )}
      </div>
    </div>
  );
}
