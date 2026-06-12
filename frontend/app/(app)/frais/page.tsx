'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Receipt, Plus, Check, X, Clock, Paperclip, Banknote } from 'lucide-react';
import { api, authedFetch } from '@/lib/api';
import { me as fetchMe, User } from '@/lib/auth';
import { formatDate } from '@/lib/utils';

interface Category { id: string; name: string; color: string }
interface Claim {
  id: string; status: string; date: string; description: string; merchant: string | null;
  amountTtc: string | number; vatAmount: string | number | null; currency: string;
  receiptAttachmentId: string | null; decisionNote: string | null;
  category: { name: string; color: string };
  user?: { id: string; firstName: string; lastName: string };
  approver?: { firstName: string; lastName: string } | null;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'En attente', cls: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Validee', cls: 'bg-blue-100 text-blue-700' },
  REJECTED: { label: 'Refusee', cls: 'bg-red-100 text-red-700' },
  REIMBURSED: { label: 'Remboursee', cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'Annulee', cls: 'bg-slate-100 text-slate-600' },
};

function amount(c: Claim) { return Number(c.amountTtc).toFixed(2) + ' ' + c.currency; }

export default function FraisPage() {
  const [user, setUser] = useState<User | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [mine, setMine] = useState<Claim[]>([]);
  const [pending, setPending] = useState<Claim[]>([]);
  const [toReimburse, setToReimburse] = useState<Claim[]>([]);
  const [draft, setDraft] = useState<any>({ categoryId: '', date: '', description: '', merchant: '', amountTtc: '', vatAmount: '', currency: 'EUR' });
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isManager = !!user && (user.isSuperAdmin || user.role === 'ADMIN' || user.role === 'MANAGER');

  async function load() {
    try {
      const [c, m] = await Promise.all([api.get<Category[]>('/expenses/categories'), api.get<Claim[]>('/expenses/mine')]);
      setCats(c); setMine(m);
      if (!draft.categoryId && c.length) setDraft((d: any) => ({ ...d, categoryId: c[0].id }));
    } catch (err: any) { toast.error('Chargement frais echoue : ' + (err?.message ?? 'erreur')); }
  }
  async function loadManager() {
    try {
      const [p, r] = await Promise.all([api.get<Claim[]>('/expenses/pending'), api.get<Claim[]>('/expenses/to-reimburse')]);
      setPending(p); setToReimburse(r);
    } catch { /* non-manager */ }
  }

  useEffect(() => { fetchMe().then(setUser).catch(() => {}); }, []);
  useEffect(() => { load(); }, []);
  useEffect(() => { if (isManager) loadManager(); }, [isManager]);

  async function uploadReceipt(claimId: string, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    const r = await authedFetch('/api/expenses/' + claimId + '/receipt', { method: 'POST', body: fd });
    if (!r.ok) throw new Error('Upload du justificatif echoue (HTTP ' + r.status + ')');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.categoryId || !draft.date || !draft.description || !draft.amountTtc) { toast.error('Categorie, date, description et montant requis'); return; }
    setSubmitting(true);
    try {
      const claim = await api.post('/expenses', {
        categoryId: draft.categoryId,
        date: draft.date,
        description: draft.description,
        merchant: draft.merchant || undefined,
        amountTtc: Number(draft.amountTtc),
        vatAmount: draft.vatAmount ? Number(draft.vatAmount) : undefined,
        currency: draft.currency || 'EUR',
      });
      const file = fileRef.current?.files?.[0];
      if (file) { try { await uploadReceipt(claim.id, file); } catch (err: any) { toast.error(err.message); } }
      toast.success('Note de frais envoyee');
      setDraft((d: any) => ({ ...d, date: '', description: '', merchant: '', amountTtc: '', vatAmount: '' }));
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err: any) { toast.error(err.message ?? 'Erreur'); }
    finally { setSubmitting(false); }
  }

  async function attachTo(claimId: string, file: File) {
    try { await uploadReceipt(claimId, file); toast.success('Justificatif ajoute'); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  function viewReceipt(id: string) {
    authedFetch('/api/expenses/' + id + '/receipt')
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then((blob) => { const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 30000); })
      .catch((err) => toast.error('Justificatif indisponible : ' + err.message));
  }

  async function cancel(id: string) {
    try { await api.post('/expenses/' + id + '/cancel', {}); toast.success('Note annulee'); load(); }
    catch (err: any) { toast.error(err.message); }
  }
  async function decide(id: string, approve: boolean) {
    let note: string | undefined;
    if (!approve) note = window.prompt('Motif du refus (optionnel) :') ?? undefined;
    try { await api.post('/expenses/' + id + '/decide', { approve, note }); toast.success(approve ? 'Validee' : 'Refusee'); loadManager(); load(); }
    catch (err: any) { toast.error(err.message); }
  }
  async function reimburse(id: string) {
    try { await api.post('/expenses/' + id + '/reimburse', {}); toast.success('Marquee remboursee'); loadManager(); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-3xl font-bold flex items-center gap-3"><Receipt size={28} className="text-mdo-600" /> Notes de frais</h1>

      {/* Nouvelle note */}
      <form onSubmit={submit} className="card p-6 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Plus size={18} className="text-mdo-600" /> Nouvelle note de frais</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Categorie</label>
            <select className="input" value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Date</label><input type="date" className="input" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></div>
          <div><label className="label">Montant TTC</label><input type="number" step="0.01" min="0" className="input" value={draft.amountTtc} onChange={(e) => setDraft({ ...draft, amountTtc: e.target.value })} /></div>
          <div><label className="label">Dont TVA (optionnel)</label><input type="number" step="0.01" min="0" className="input" value={draft.vatAmount} onChange={(e) => setDraft({ ...draft, vatAmount: e.target.value })} /></div>
          <div className="md:col-span-2"><label className="label">Description</label><input className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
          <div><label className="label">Commercant (optionnel)</label><input className="input" value={draft.merchant} onChange={(e) => setDraft({ ...draft, merchant: e.target.value })} /></div>
          <div><label className="label">Justificatif</label><input ref={fileRef} type="file" className="input text-xs" accept="image/*,application/pdf" /></div>
        </div>
        <div className="flex justify-end"><button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? 'Envoi...' : 'Envoyer la note'}</button></div>
      </form>

      {/* A valider */}
      {isManager && pending.length > 0 && (
        <div className="card overflow-hidden border-amber-200">
          <div className="p-3 border-b bg-amber-50 font-semibold flex items-center gap-2 text-amber-800"><Clock size={16} /> A valider ({pending.length})</div>
          <table className="w-full text-sm"><tbody>
            {pending.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-3">{c.user?.firstName} {c.user?.lastName}</td>
                <td className="p-3"><span className="badge" style={{ background: c.category.color + '22', color: c.category.color }}>{c.category.name}</span></td>
                <td className="p-3">{formatDate(c.date)}</td>
                <td className="p-3 font-medium">{amount(c)}</td>
                <td className="p-3 text-slate-500 text-xs">{c.description}</td>
                <td className="p-3">{c.receiptAttachmentId ? <button onClick={() => viewReceipt(c.id)} className="text-mdo-600 hover:underline text-xs inline-flex items-center gap-1"><Paperclip size={12} />justif.</button> : <span className="text-xs text-slate-400">pas de justif.</span>}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button onClick={() => decide(c.id, true)} className="text-emerald-600 hover:text-emerald-800 mr-3" title="Valider"><Check size={16} /></button>
                  <button onClick={() => decide(c.id, false)} className="text-red-500 hover:text-red-700" title="Refuser"><X size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {/* A rembourser */}
      {isManager && toReimburse.length > 0 && (
        <div className="card overflow-hidden border-emerald-200">
          <div className="p-3 border-b bg-emerald-50 font-semibold flex items-center gap-2 text-emerald-800"><Banknote size={16} /> A rembourser ({toReimburse.length})</div>
          <table className="w-full text-sm"><tbody>
            {toReimburse.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-3">{c.user?.firstName} {c.user?.lastName}</td>
                <td className="p-3">{c.category.name}</td>
                <td className="p-3 font-medium">{amount(c)}</td>
                <td className="p-3 text-right">
                  <button onClick={() => reimburse(c.id)} className="btn btn-secondary text-xs">Marquer rembourse</button>
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {/* Mes notes */}
      <div className="card overflow-hidden">
        <div className="p-3 border-b font-semibold">Mes notes de frais</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="p-3">Date</th><th className="p-3">Categorie</th><th className="p-3">Montant</th><th className="p-3">Description</th><th className="p-3">Statut</th><th className="p-3">Justificatif</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {mine.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-slate-400">Aucune note pour le moment.</td></tr>
            ) : mine.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-3">{formatDate(c.date)}</td>
                <td className="p-3"><span className="badge" style={{ background: c.category.color + '22', color: c.category.color }}>{c.category.name}</span></td>
                <td className="p-3 font-medium">{amount(c)}</td>
                <td className="p-3 text-slate-600">{c.description}{c.merchant ? ' · ' + c.merchant : ''}</td>
                <td className="p-3">
                  <span className={'badge ' + (STATUS[c.status]?.cls ?? '')}>{STATUS[c.status]?.label ?? c.status}</span>
                  {c.decisionNote && <div className="text-xs text-slate-400 mt-0.5">{c.decisionNote}</div>}
                </td>
                <td className="p-3">
                  {c.receiptAttachmentId ? (
                    <button onClick={() => viewReceipt(c.id)} className="text-mdo-600 hover:underline text-xs inline-flex items-center gap-1"><Paperclip size={12} /> voir</button>
                  ) : (
                    <label className="text-xs text-slate-500 hover:text-mdo-600 cursor-pointer inline-flex items-center gap-1">
                      <Paperclip size={12} /> ajouter
                      <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) attachTo(c.id, f); }} />
                    </label>
                  )}
                </td>
                <td className="p-3 text-right">
                  {(c.status === 'PENDING' || c.status === 'APPROVED') && (
                    <button onClick={() => cancel(c.id)} className="text-xs text-slate-500 hover:text-red-600">Annuler</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
