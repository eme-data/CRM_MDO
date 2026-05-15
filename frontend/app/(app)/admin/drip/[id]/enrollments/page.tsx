'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pause, Play, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface Enrollment {
  id: string;
  recipientEmail: string;
  recipientName: string | null;
  status: string;
  enrolledAt: string;
  completedAt: string | null;
  nextStepIndex: number;
  contact?: { id: string; firstName: string; lastName: string } | null;
  company?: { id: string; name: string } | null;
  _count: { sentEmails: number };
}

const STATUS_COLOR: Record<string, string> = {
  RUNNING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  PAUSED: 'bg-amber-100 text-amber-700',
  UNSUBSCRIBED: 'bg-red-100 text-red-700',
};

export default function EnrollmentsPage() {
  const params = useParams();
  const id = params.id as string;
  const [items, setItems] = useState<Enrollment[]>([]);
  const [adding, setAdding] = useState(false);
  const [campaign, setCampaign] = useState<any>(null);

  async function load() {
    setItems(await api.get('/drip/enrollments?campaignId=' + id));
  }

  useEffect(() => {
    load();
    api.get('/drip/campaigns/' + id).then(setCampaign);
  }, [id]);

  async function action(eId: string, action: 'pause' | 'resume' | 'unsubscribe') {
    try { await api.post('/drip/enrollments/' + eId + '/' + action); toast.success('OK'); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  async function enroll(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const recipientEmail = (f.elements.namedItem('email') as HTMLInputElement).value;
    const recipientName = (f.elements.namedItem('name') as HTMLInputElement).value || undefined;
    try {
      await api.post('/drip/enrollments', { campaignId: id, recipientEmail, recipientName });
      toast.success('Enrolle');
      setAdding(false);
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/drip" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} className="mr-1" /> Retour campagnes
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Enrollements — {campaign?.name ?? '...'}</h1>
        <button onClick={() => setAdding(true)} className="btn btn-primary">+ Enroller un email</button>
      </div>

      {adding && (
        <form onSubmit={enroll} className="card p-4 flex items-end gap-3 border-mdo-200 bg-mdo-50">
          <div className="flex-1"><label className="label">Email *</label><input name="email" type="email" required className="input" /></div>
          <div className="flex-1"><label className="label">Nom (optionnel)</label><input name="name" className="input" /></div>
          <button type="submit" className="btn btn-primary">Enroller</button>
          <button type="button" onClick={() => setAdding(false)} className="btn btn-secondary">Annuler</button>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Destinataire</th>
              <th className="p-3 font-medium">Lien</th>
              <th className="p-3 font-medium">Enrolle le</th>
              <th className="p-3 font-medium text-center">Etape</th>
              <th className="p-3 font-medium text-center">Envoyes</th>
              <th className="p-3 font-medium">Statut</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-slate-400">Aucun enrollement.</td></tr>
            ) : items.map((e) => (
              <tr key={e.id} className="border-t hover:bg-slate-50">
                <td className="p-3">
                  <div className="font-medium">{e.recipientName ?? '—'}</div>
                  <div className="text-xs text-slate-400">{e.recipientEmail}</div>
                </td>
                <td className="p-3 text-xs">
                  {e.company && <Link href={'/companies/' + e.company.id} className="text-mdo-600 hover:underline block">{e.company.name}</Link>}
                  {e.contact && <Link href={'/contacts/' + e.contact.id} className="text-mdo-600 hover:underline block">{e.contact.firstName} {e.contact.lastName}</Link>}
                </td>
                <td className="p-3 text-xs">{formatDate(e.enrolledAt)}</td>
                <td className="p-3 text-center">{e.nextStepIndex + 1} / {(campaign?.steps?.length ?? 0)}</td>
                <td className="p-3 text-center">{e._count.sentEmails}</td>
                <td className="p-3"><span className={'badge ' + STATUS_COLOR[e.status]}>{e.status}</span></td>
                <td className="p-3 text-right">
                  {e.status === 'RUNNING' && <button onClick={() => action(e.id, 'pause')} className="text-amber-600 mr-2" title="Pause"><Pause size={14} /></button>}
                  {e.status === 'PAUSED' && <button onClick={() => action(e.id, 'resume')} className="text-emerald-600 mr-2" title="Reprendre"><Play size={14} /></button>}
                  {(e.status === 'RUNNING' || e.status === 'PAUSED') && <button onClick={() => action(e.id, 'unsubscribe')} className="text-red-500" title="Desinscrire"><X size={14} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
