'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { FileText, Download, Play, ExternalLink } from 'lucide-react';
import { api, downloadAttachment } from '@/lib/api';
import { formatDate, formatEuro } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Brouillon', ISSUED: 'Emise', PAID: 'Payee', OVERDUE: 'En retard', CANCELLED: 'Annulee',
};
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  ISSUED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  OVERDUE: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

async function downloadPdf(invoiceId: string, number: string) {
  const token = localStorage.getItem('crm_mdo_access_token');
  const res = await fetch('/api/invoices/' + invoiceId + '/pdf', {
    headers: token ? { Authorization: 'Bearer ' + token } : {},
  });
  if (!res.ok) { toast.error('Erreur'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'facture_' + number + '.pdf';
  a.click();
  URL.revokeObjectURL(url);
}

export default function InvoicesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [generating, setGenerating] = useState(false);

  async function load() {
    const p = status ? '?status=' + status : '';
    setItems(await api.get('/invoices' + p));
  }
  useEffect(() => { load(); }, [status]);

  async function generateMonthly() {
    if (!confirm('Generer les factures mensuelles pour tous les contrats actifs ?')) return;
    setGenerating(true);
    try {
      const r = await api.post('/invoices/generate-monthly');
      toast.success(r.created + ' factures creees');
      load();
    } catch (err: any) { toast.error(err.message); } finally { setGenerating(false); }
  }

  async function setStatusForInvoice(id: string, newStatus: string) {
    await api.patch('/invoices/' + id + '/status', { status: newStatus });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Factures</h1>
        <button onClick={generateMonthly} disabled={generating} className="btn btn-primary">
          <Play size={14} className="mr-1" /> {generating ? 'Generation...' : 'Generer mensuel'}
        </button>
      </div>
      <div className="card p-4">
        <select className="input max-w-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous statuts</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-700 text-left">
            <tr>
              <th className="p-3 font-medium">Numero</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">Emise</th>
              <th className="p-3 font-medium">Echeance</th>
              <th className="p-3 font-medium">Total HT</th>
              <th className="p-3 font-medium">Total TTC</th>
              <th className="p-3 font-medium">Statut</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-slate-400">Aucune facture</td></tr>
            ) : items.map((i) => (
              <tr key={i.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                <td className="p-3 font-mono">
                  <div className="flex items-center gap-2">
                    {i.number}
                    {i.provider && i.provider !== 'INTERNAL' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 uppercase">
                        {i.provider}
                      </span>
                    )}
                  </div>
                </td>
                <td className="p-3">
                  <Link href={'/companies/' + i.company.id} className="text-mdo-600 hover:underline">{i.company.name}</Link>
                </td>
                <td className="p-3">{formatDate(i.issueDate)}</td>
                <td className="p-3">{formatDate(i.dueDate)}</td>
                <td className="p-3">{formatEuro(i.totalHt)}</td>
                <td className="p-3 font-medium">{formatEuro(i.totalTtc)}</td>
                <td className="p-3">
                  <select
                    className="input text-xs py-1"
                    value={i.status}
                    onChange={(e) => setStatusForInvoice(i.id, e.target.value)}
                    disabled={i.provider && i.provider !== 'INTERNAL'}
                    title={i.provider && i.provider !== 'INTERNAL' ? 'Statut gere par ' + i.provider : ''}
                  >
                    {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {i.externalUrl ? (
                      <a
                        href={i.externalUrl}
                        target="_blank"
                        rel="noopener"
                        className="text-mdo-600 hover:text-mdo-700"
                        title="Ouvrir dans le provider externe"
                      >
                        <ExternalLink size={16} />
                      </a>
                    ) : (
                      <button onClick={() => downloadPdf(i.id, i.number)} className="text-mdo-600 hover:text-mdo-700">
                        <Download size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
