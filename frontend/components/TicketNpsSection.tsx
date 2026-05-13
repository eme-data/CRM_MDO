'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Star, Send, Copy, MessageSquare, CheckCircle2, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';
import { useConfirm } from '@/components/ui/ConfirmDialog';

interface TicketSatisfaction {
  id: string;
  token: string;
  tokenExpiresAt: string;
  sentTo: string;
  sentAt: string;
  score: number | null;
  comment: string | null;
  submittedAt: string | null;
}

export function TicketNpsSection({ ticketId, ticketStatus }: { ticketId: string; ticketStatus: string }) {
  const [sat, setSat] = useState<TicketSatisfaction | null | undefined>(undefined);
  const confirm = useConfirm();

  async function load() {
    try {
      const s = await api.get(`/tickets/${ticketId}/nps`);
      setSat(s);
    } catch {
      setSat(null);
    }
  }
  useEffect(() => { load(); }, [ticketId]);

  async function send(force = false) {
    const ok = await confirm({
      title: force ? 'Renvoyer la demande NPS ?' : 'Envoyer une demande NPS ?',
      message: 'Un email sera envoye au contact du ticket avec un lien securise vers la page de notation. Le lien expire dans 30 jours.',
      confirmLabel: 'Envoyer',
      tone: 'info',
    });
    if (!ok) return;
    try {
      await api.post(`/tickets/${ticketId}/nps/send`, { force });
      toast.success('Demande NPS envoyee');
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function copyLink() {
    if (!sat) return;
    const url = `${window.location.origin}/nps/${sat.token}`;
    await navigator.clipboard.writeText(url);
    toast.success('Lien copie');
  }

  if (sat === undefined) {
    return (
      <div className="card p-6">
        <div className="h-5 w-40 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
      </div>
    );
  }

  const isResolved = ticketStatus === 'RESOLVED' || ticketStatus === 'CLOSED';

  return (
    <div className="card p-6 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold flex items-center gap-2">
          <Star size={18} className="text-amber-500" />
          Satisfaction client (NPS)
        </h2>
        {!sat && isResolved && (
          <button onClick={() => send(false)} className="btn btn-primary text-sm py-1.5">
            <Send size={14} className="mr-1" /> Envoyer la demande
          </button>
        )}
        {sat && !sat.submittedAt && (
          <div className="flex gap-2">
            <button onClick={copyLink} className="btn btn-secondary text-xs py-1">
              <Copy size={12} className="mr-1" /> Copier le lien
            </button>
            <button onClick={() => send(true)} className="btn btn-secondary text-xs py-1">
              <Send size={12} className="mr-1" /> Renvoyer
            </button>
          </div>
        )}
      </div>

      {!sat && !isResolved && (
        <p className="text-sm text-slate-500">
          La demande NPS sera envoyee automatiquement quand le ticket passera en statut <strong>Resolu</strong> (configurable dans Admin → Settings).
        </p>
      )}
      {!sat && isResolved && (
        <p className="text-sm text-slate-500">
          Aucune demande NPS n'a ete envoyee pour ce ticket. Cliquez sur "Envoyer la demande" pour solliciter une evaluation du client.
        </p>
      )}

      {sat && !sat.submittedAt && (
        <div className="text-sm space-y-1">
          <p className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <Clock size={14} className="text-slate-400" />
            Envoye a <strong className="font-medium">{sat.sentTo}</strong> le {formatDateTime(sat.sentAt)}
          </p>
          <p className="text-xs text-slate-400">Le lien expire le {formatDate(sat.tokenExpiresAt)}. En attente de reponse du client.</p>
        </div>
      )}

      {sat && sat.submittedAt && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <ScoreBadge score={sat.score!} />
            <span className="text-xs text-slate-400 inline-flex items-center gap-1">
              <CheckCircle2 size={12} className="text-emerald-500" />
              Repondu le {formatDateTime(sat.submittedAt)}
            </span>
          </div>
          {sat.comment && (
            <div className="rounded-md bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 p-3 text-sm">
              <p className="text-xs text-slate-500 mb-1 inline-flex items-center gap-1">
                <MessageSquare size={11} /> Commentaire du client
              </p>
              <p className="whitespace-pre-wrap">{sat.comment}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const segment =
    score >= 9 ? { label: 'Promoteur', cls: 'bg-emerald-100 text-emerald-700' }
    : score >= 7 ? { label: 'Neutre', cls: 'bg-amber-100 text-amber-700' }
    : { label: 'Detracteur', cls: 'bg-red-100 text-red-700' };
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-2xl font-bold tabular-nums">{score}</span>
      <span className="text-slate-400">/ 10</span>
      <span className={'badge ' + segment.cls}>{segment.label}</span>
    </span>
  );
}
