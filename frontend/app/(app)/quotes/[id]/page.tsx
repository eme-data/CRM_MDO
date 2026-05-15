'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, Send, Check, X, Trash2, FileSignature } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatDate, formatEuro, quoteStatusColor, quoteStatusLabel } from '@/lib/utils';

const OFFER_OPTIONS = [
  { value: 'MDO_ESSENTIEL', label: 'MDO Essentiel' },
  { value: 'MDO_PRO', label: 'MDO Pro' },
  { value: 'MDO_SOUVERAIN', label: 'MDO Souverain' },
  { value: 'CUSTOM', label: 'Sur mesure' },
];

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [q, setQ] = useState<any>(null);
  const [converting, setConverting] = useState(false);
  const confirm = useConfirm();

  async function load() { setQ(await api.get('/quotes/' + id)); }
  useEffect(() => { load(); }, [id]);

  async function downloadPdf() {
    const token = localStorage.getItem('crm_mdo_access_token');
    const r = await fetch('/api/quotes/' + id + '/pdf', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = q.reference + '.pdf'; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSend() {
    try { await api.post('/quotes/' + id + '/send'); toast.success('Devis marque comme envoye'); load(); }
    catch (err: any) { toast.error(err.message); }
  }
  async function handleAccept() {
    try { await api.post('/quotes/' + id + '/accept'); toast.success('Devis accepte'); load(); }
    catch (err: any) { toast.error(err.message); }
  }
  async function handleReject() {
    const reason = prompt('Motif du refus (optionnel) ?') ?? undefined;
    try { await api.post('/quotes/' + id + '/reject', { reason }); toast.success('Devis refuse'); load(); }
    catch (err: any) { toast.error(err.message); }
  }
  async function handleDelete() {
    const ok = await confirm({
      title: 'Supprimer ce devis ?',
      message: 'Le devis ' + (q?.reference ?? '') + ' sera definitivement supprime.',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try { await api.delete('/quotes/' + id); toast.success('Devis supprime'); router.replace('/quotes'); }
    catch (err: any) { toast.error(err.message); }
  }

  async function handleConvert(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const offer = (f.elements.namedItem('offer') as HTMLSelectElement).value;
    const startDate = (f.elements.namedItem('startDate') as HTMLInputElement).value;
    const endDate = (f.elements.namedItem('endDate') as HTMLInputElement).value;
    const engagementMonths = parseInt((f.elements.namedItem('engagementMonths') as HTMLInputElement).value);
    try {
      const res = await api.post('/quotes/' + id + '/convert', { offer, startDate, endDate, engagementMonths });
      toast.success('Contrat ' + res.contract.reference + ' cree');
      router.push('/contracts/' + res.contract.id);
    } catch (err: any) { toast.error(err.message); }
  }

  if (!q) return <div>Chargement...</div>;

  return (
    <div className="space-y-6">
      <Link href="/quotes" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} className="mr-1" /> Retour aux devis
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold font-mono">{q.reference}</h1>
            <span className={'badge ' + quoteStatusColor[q.status]}>{quoteStatusLabel[q.status]}</span>
          </div>
          <p className="text-slate-600 mt-1">{q.title}</p>
          <Link href={'/companies/' + q.company.id} className="text-mdo-600 hover:underline text-sm">
            {q.company.name}
          </Link>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={downloadPdf} className="btn btn-secondary"><Download size={16} className="mr-1" /> PDF</button>
          {q.status === 'DRAFT' && (
            <button onClick={handleSend} className="btn btn-primary"><Send size={16} className="mr-1" /> Marquer envoye</button>
          )}
          {q.status === 'SENT' && (
            <>
              <button onClick={handleAccept} className="btn btn-primary"><Check size={16} className="mr-1" /> Accepter</button>
              <button onClick={handleReject} className="btn btn-secondary"><X size={16} className="mr-1" /> Refuser</button>
            </>
          )}
          {q.status === 'ACCEPTED' && !q.convertedToContractId && (
            <button onClick={() => setConverting(!converting)} className="btn btn-primary">
              <FileSignature size={16} className="mr-1" /> Convertir en contrat
            </button>
          )}
          <button onClick={handleDelete} className="btn btn-danger" disabled={!!q.convertedToContractId}>
            <Trash2 size={16} className="mr-1" /> Supprimer
          </button>
        </div>
      </div>

      {q.convertedToContract && (
        <div className="card p-4 border-emerald-200 bg-emerald-50/50">
          <p className="text-sm">
            Devis converti en{' '}
            <Link href={'/contracts/' + q.convertedToContract.id} className="text-mdo-600 font-medium hover:underline">
              contrat {q.convertedToContract.reference}
            </Link>{' '}
            le {formatDate(q.convertedAt)}.
          </p>
        </div>
      )}

      {converting && (
        <form onSubmit={handleConvert} className="card p-6 space-y-4 border-mdo-200 bg-mdo-50">
          <h2 className="font-semibold">Convertir en contrat</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className="label">Offre</label>
              <select name="offer" required className="input" defaultValue="MDO_PRO">
                {OFFER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div><label className="label">Debut</label><input name="startDate" type="date" required className="input" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
            <div><label className="label">Fin</label><input name="endDate" type="date" required className="input" defaultValue={new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)} /></div>
            <div><label className="label">Engagement (mois)</label><input name="engagementMonths" type="number" required className="input" defaultValue={12} min={1} /></div>
          </div>
          <button type="submit" className="btn btn-primary">Creer le contrat</button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6 space-y-2 md:col-span-2">
          <h2 className="font-semibold mb-2">Lignes</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b">
              <tr>
                <th className="py-2 font-medium">Description</th>
                <th className="py-2 font-medium text-right">Qte</th>
                <th className="py-2 font-medium text-right">PU HT</th>
                <th className="py-2 font-medium text-right">Remise</th>
                <th className="py-2 font-medium text-right">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {q.lines.map((l: any) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="py-2 pr-2 whitespace-pre-wrap">{l.description}</td>
                  <td className="py-2 text-right">{l.quantity}</td>
                  <td className="py-2 text-right">{formatEuro(l.unitPriceHt)}</td>
                  <td className="py-2 text-right">{Number(l.discountPct) > 0 ? Number(l.discountPct) + ' %' : '-'}</td>
                  <td className="py-2 text-right font-medium">{formatEuro(l.lineTotalHt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t mt-4 pt-3 text-right space-y-1 text-sm">
            <div>Sous-total HT : <span className="font-medium">{formatEuro(q.subtotalHt)}</span></div>
            <div>TVA ({Number(q.vatRate)} %) : <span className="font-medium">{formatEuro(q.vatAmount)}</span></div>
            <div className="text-lg font-bold text-mdo-600">Total TTC : {formatEuro(q.totalTtc)}</div>
          </div>
        </div>
        <div className="card p-6 space-y-3">
          <h2 className="font-semibold">Informations</h2>
          <Info label="Emis le" value={formatDate(q.issueDate)} />
          <Info label="Valable jusqu'au" value={formatDate(q.validUntil)} />
          <Info label="Envoye le" value={q.sentAt ? formatDate(q.sentAt) : '-'} />
          <Info label="Accepte le" value={q.acceptedAt ? formatDate(q.acceptedAt) : '-'} />
          {q.rejectionReason && <Info label="Motif refus" value={q.rejectionReason} />}
          {q.opportunity && (
            <Info label="Opportunite" value={
              <Link href={'/opportunities/' + q.opportunity.id} className="text-mdo-600 hover:underline">{q.opportunity.title}</Link>
            } />
          )}
          {q.notes && <div><div className="text-xs text-slate-500 mb-1">Notes</div><p className="text-sm whitespace-pre-wrap">{q.notes}</p></div>}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex text-sm">
      <span className="w-32 text-slate-500 shrink-0">{label}</span>
      <span className="font-medium">{value ?? '-'}</span>
    </div>
  );
}
