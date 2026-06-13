'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { FileText, Download, Play, ExternalLink, Plus, X } from 'lucide-react';
import { api, downloadAttachment } from '@/lib/api';
import { formatDate, formatEuro } from '@/lib/utils';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useReloadOnFocus } from '@/lib/useReloadOnFocus';
import { me as fetchMe } from '@/lib/auth';
import { hasFeature } from '@/lib/modules';

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
  const [showCreate, setShowCreate] = useState(false);
  const [canStock, setCanStock] = useState(false);
  const confirm = useConfirm();

  async function load() {
    const p = status ? '?status=' + status : '';
    setItems(await api.get('/invoices' + p));
  }
  useEffect(() => { load(); }, [status]);
  useEffect(() => { fetchMe().then((u) => setCanStock(hasFeature(u.modules, 'stock.inventory'))).catch(() => {}); }, []);
  useReloadOnFocus(load);

  async function generateMonthly() {
    const ok = await confirm({
      title: 'Generer les factures mensuelles ?',
      message: 'Une facture brouillon sera creee pour chaque contrat actif. Les contrats deja factures ce mois-ci sont ignores.',
      confirmLabel: 'Generer',
      tone: 'info',
    });
    if (!ok) return;
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
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)} className="btn btn-secondary"><Plus size={14} className="mr-1" /> Nouvelle facture</button>
          <button onClick={generateMonthly} disabled={generating} className="btn btn-primary">
            <Play size={14} className="mr-1" /> {generating ? 'Generation...' : 'Generer mensuel'}
          </button>
        </div>
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

      {showCreate && <CreateInvoiceModal canStock={canStock} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function CreateInvoiceModal({ canStock, onClose, onSaved }: { canStock: boolean; onClose: () => void; onSaved: () => void }) {
  const [companies, setCompanies] = useState<any[]>([]);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [vatRate, setVatRate] = useState('20');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<any[]>([{ description: '', quantity: '1', unitPriceHt: '', stockItemId: '' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/companies').then((d: any) => setCompanies(d.items ?? d)).catch(() => {});
    if (canStock) api.get('/stock/items').then((d: any) => setStockItems(d)).catch(() => {});
  }, []);

  function setLine(i: number, patch: any) { setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l))); }
  function onPickItem(i: number, stockItemId: string) {
    const it = stockItems.find((x) => x.id === stockItemId);
    setLine(i, { stockItemId, description: it && !lines[i].description ? it.name : lines[i].description });
  }
  const totalHt = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPriceHt) || 0), 0);

  async function save() {
    const goodLines = lines.filter((l) => l.description.trim() && Number(l.quantity) > 0).map((l) => ({
      description: l.description.trim(), quantity: Number(l.quantity), unitPriceHt: Number(l.unitPriceHt) || 0,
      stockItemId: l.stockItemId || undefined,
    }));
    if (!companyId || goodLines.length === 0) { toast.error('Client et au moins une ligne requis'); return; }
    setSaving(true);
    try {
      await api.post('/invoices', {
        companyId, issueDate: issueDate || undefined, dueDate: dueDate || undefined,
        vatRate: Number(vatRate) || 20, notes: notes || undefined, lines: goodLines,
      });
      toast.success('Facture creee (brouillon)'); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-4">Nouvelle facture</h3>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <select className="input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Client *</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className="input" type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)} placeholder="TVA %" title="Taux de TVA %" />
            <input className="input" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} title="Date d'emission" />
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} title="Echeance" />
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-slate-500">Lignes {canStock && <span className="font-normal">— lier un article décrémente le stock à l'émission</span>}</div>
            {lines.map((l, i) => (
              <div key={i} className="flex gap-2 items-center">
                {canStock && (
                  <select className="input w-40" value={l.stockItemId} onChange={(e) => onPickItem(i, e.target.value)} title="Article de stock (optionnel)">
                    <option value="">— Stock —</option>
                    {stockItems.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.totalQty})</option>)}
                  </select>
                )}
                <input className="input flex-1" placeholder="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                <input className="input w-16" type="number" placeholder="Qté" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <input className="input w-24" type="number" placeholder="PU HT" value={l.unitPriceHt} onChange={(e) => setLine(i, { unitPriceHt: e.target.value })} />
                <button onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} className="text-slate-300 hover:text-red-500"><X size={16} /></button>
              </div>
            ))}
            <button onClick={() => setLines((ls) => [...ls, { description: '', quantity: '1', unitPriceHt: '', stockItemId: '' }])} className="text-sm text-mdo-600 hover:underline flex items-center gap-1"><Plus size={14} /> Ajouter une ligne</button>
          </div>

          <input className="input" placeholder="Notes (optionnel)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm">Total HT : <strong>{formatEuro(totalHt)}</strong></span>
            <div className="flex gap-2"><button onClick={onClose} className="btn btn-secondary">Annuler</button><button onClick={save} disabled={saving} className="btn btn-primary">{saving ? '...' : 'Créer (brouillon)'}</button></div>
          </div>
          <p className="text-xs text-slate-400">La facture est créée en brouillon. Le décrément de stock (si activé) a lieu au passage en « Émise ».</p>
        </div>
      </div>
    </div>
  );
}
