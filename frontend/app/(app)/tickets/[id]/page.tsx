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
  Paperclip,
  Download,
  X,
  FileText,
} from 'lucide-react';
import { api, apiUpload, downloadAttachment } from '@/lib/api';
import { TicketTimerButton } from '@/components/TicketTimerButton';
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

function formatBytes(n: number): string {
  if (n < 1024) return n + ' o';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' Ko';
  return (n / 1024 / 1024).toFixed(1) + ' Mo';
}

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [ticket, setTicket] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  async function load() {
    setTicket(await api.get('/tickets/' + id));
  }

  useEffect(() => {
    load();
    api.get('/users').then(setUsers);
    api.get('/response-templates').then(setTemplates).catch(() => {});
  }, [id]);

  function applyTemplate(t: any) {
    if (!ticket) return;
    // Substitution simple cote client (le backend gere aussi mais on prefait l'apercu)
    const ctx: any = {
      ticket: {
        reference: ticket.reference,
        title: ticket.title,
        company: { name: ticket.company.name },
        contact: ticket.contact ? { firstName: ticket.contact.firstName, lastName: ticket.contact.lastName } : {},
      },
      user: {},
    };
    const rendered = t.body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m: string, p: string) => {
      const v = p.split('.').reduce((acc: any, k: string) => acc?.[k], ctx);
      return v != null ? String(v) : m;
    });
    setNewMessage((prev) => (prev ? prev + '\n\n' + rendered : rendered));
    setShowTemplates(false);
  }

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

  function addFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list);
    setPendingFiles((prev) => [...prev, ...arr]);
  }

  function removePendingFile(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submitMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() && pendingFiles.length === 0) return;
    setPosting(true);
    try {
      // 1. Upload des fichiers d'abord (si presents) -> recupere les IDs
      let attachmentIds: string[] = [];
      if (pendingFiles.length > 0) {
        const res = await apiUpload.upload('/attachments/upload', pendingFiles, { ticketId: id });
        attachmentIds = res.items.map((a: any) => a.id);
      }
      // 2. Creation du message avec les IDs des attachments
      await api.post('/tickets/' + id + '/messages', {
        content: newMessage || '(piece(s) jointe(s))',
        isInternal,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        cc: !isInternal && cc.trim() ? cc.trim() : undefined,
        bcc: !isInternal && bcc.trim() ? bcc.trim() : undefined,
      });
      setNewMessage('');
      setIsInternal(false);
      setShowCcBcc(false);
      setCc('');
      setBcc('');
      setPendingFiles([]);
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

  async function dlAttachment(att: { id: string; filename: string }) {
    try {
      await downloadAttachment(att.id, att.filename);
    } catch (err: any) {
      toast.error(err.message);
    }
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
        <div className="flex gap-2">
          <TicketTimerButton ticketId={id} />
          <button onClick={handleDelete} className="btn btn-danger">
            <Trash2 size={16} className="mr-1" /> Supprimer
          </button>
        </div>
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
                <MessageBubble key={m.id} m={m} onDownload={dlAttachment} />
              ))}
            </div>

            <form onSubmit={submitMessage} className="space-y-2 border-t pt-4">
              <textarea
                className="input min-h-[100px]"
                placeholder="Repondre..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
              />

              {!isInternal && showCcBcc && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="input"
                    placeholder="Cc (separe par virgules)"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="Bcc (separe par virgules)"
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                  />
                </div>
              )}

              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 border border-dashed border-slate-300 rounded-md">
                  {pendingFiles.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-slate-100 px-2 py-1 rounded">
                      <Paperclip size={12} />
                      {f.name} ({formatBytes(f.size)})
                      <button type="button" onClick={() => removePendingFile(i)} className="hover:text-red-600">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap justify-between items-center gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                    />
                    Note interne (non visible client)
                  </label>
                  <label className="btn btn-secondary cursor-pointer text-xs py-1">
                    <Paperclip size={14} className="mr-1" /> Joindre
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => addFiles(e.target.files)}
                    />
                  </label>
                  {!isInternal && (
                    <button
                      type="button"
                      onClick={() => setShowCcBcc(!showCcBcc)}
                      className="text-xs text-mdo-600 hover:underline"
                    >
                      {showCcBcc ? 'Masquer Cc/Bcc' : 'Cc / Bcc'}
                    </button>
                  )}
                  {templates.length > 0 && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowTemplates(!showTemplates)}
                        className="btn btn-secondary text-xs py-1"
                      >
                        <FileText size={14} className="mr-1" /> Template
                      </button>
                      {showTemplates && (
                        <div className="absolute bottom-full left-0 mb-2 w-72 max-h-72 overflow-y-auto rounded-md bg-white shadow-lg border border-slate-200 z-10">
                          {templates.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => applyTemplate(t)}
                              className="block w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-b-0 border-slate-100"
                            >
                              <div className="text-sm font-medium">{t.name}</div>
                              {t.category && <div className="text-xs text-slate-400">{t.category}</div>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={posting || (!newMessage.trim() && pendingFiles.length === 0)}
                  className="btn btn-primary"
                >
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

          <TimeSummaryCard ticketId={ticket.id} />

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

function MessageBubble({ m, onDownload }: { m: any; onDownload: (a: any) => void }) {
  return (
    <div
      className={
        'rounded-lg p-4 border ' +
        (m.isInternal ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200')
      }
    >
      <div className="flex justify-between items-start mb-2">
        <div className="text-sm font-medium">
          {m.author ? m.author.firstName + ' ' + m.author.lastName : (m.authorName ?? 'Externe')}
          {m.isInternal && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-700">
              <Lock size={12} /> Note interne
            </span>
          )}
          {m.viaEmail && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-blue-700">
              via email
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500">{formatDateTime(m.createdAt)}</span>
      </div>
      <p className="text-sm text-slate-700 whitespace-pre-wrap">{m.content}</p>
      {Array.isArray(m.attachments) && m.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-200">
          {m.attachments.map((a: any) => (
            <button
              key={a.id}
              onClick={() => onDownload(a)}
              className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 hover:bg-slate-100 rounded px-2 py-1"
            >
              <Download size={12} /> {a.filename}
              <span className="text-slate-400">({formatBytes(a.sizeBytes)})</span>
            </button>
          ))}
        </div>
      )}
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

function TimeSummaryCard({ ticketId }: { ticketId: string }) {
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => {
    api.get('/time-entries?ticketId=' + ticketId).then(setEntries).catch(() => {});
  }, [ticketId]);

  const totalMin = entries.reduce((s, e) => s + (e.durationMin ?? 0), 0);
  const billableMin = entries.filter((e) => e.billable).reduce((s, e) => s + (e.durationMin ?? 0), 0);
  const fmt = (m: number) => (m === 0 ? '0h00' : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0'));

  return (
    <div className="card p-4 text-sm space-y-2">
      <h3 className="font-semibold">Temps passe</h3>
      <Info label="Total" value={fmt(totalMin)} />
      <Info label="Facturable" value={fmt(billableMin)} />
      <Info label="Saisies" value={entries.length} />
    </div>
  );
}
