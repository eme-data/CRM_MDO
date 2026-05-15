'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatEuro } from '@/lib/utils';

interface Line {
  description: string;
  quantity: number;
  unitPriceHt: number;
  discountPct: number;
}

const DEFAULT_VALIDITY_DAYS = 30;

function emptyLine(): Line {
  return { description: '', quantity: 1, unitPriceHt: 0, discountPct: 0 };
}

export default function NewQuotePage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [companies, setCompanies] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [opps, setOpps] = useState<any[]>([]);
  const [data, setData] = useState<any>({
    title: '',
    companyId: sp.get('companyId') ?? '',
    contactId: '',
    opportunityId: sp.get('opportunityId') ?? '',
    validUntil: new Date(Date.now() + DEFAULT_VALIDITY_DAYS * 86400000).toISOString().slice(0, 10),
    vatRate: 20,
    notes: '',
    terms: '',
  });
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/companies?pageSize=500').then((r) => setCompanies(r.items));
    api.get('/opportunities').then(setOpps);
  }, []);

  useEffect(() => {
    if (!data.companyId) { setContacts([]); return; }
    api.get('/contacts?companyId=' + data.companyId).then(setContacts);
  }, [data.companyId]);

  function set(k: string, v: any) { setData((d: any) => ({ ...d, [k]: v })); }

  function setLine(i: number, k: keyof Line, v: any) {
    setLines((arr) => arr.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  }
  function addLine() { setLines((arr) => [...arr, emptyLine()]); }
  function removeLine(i: number) { setLines((arr) => arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr); }

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => {
      const raw = l.quantity * l.unitPriceHt;
      return s + raw * (1 - (l.discountPct ?? 0) / 100);
    }, 0);
    const vat = subtotal * ((data.vatRate ?? 20) / 100);
    return { subtotal, vat, total: subtotal + vat };
  }, [lines, data.vatRate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!data.companyId) { toast.error('Selectionnez une societe'); return; }
    if (lines.some((l) => !l.description || l.quantity <= 0)) {
      toast.error('Toutes les lignes doivent avoir une description et une quantite > 0');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...data,
        contactId: data.contactId || undefined,
        opportunityId: data.opportunityId || undefined,
        vatRate: Number(data.vatRate),
        lines: lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPriceHt: Number(l.unitPriceHt),
          discountPct: Number(l.discountPct ?? 0),
        })),
      };
      const q = await api.post('/quotes', payload);
      toast.success('Devis ' + q.reference + ' cree');
      router.push('/quotes/' + q.id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-3xl font-bold">Nouveau devis</h1>
      <form onSubmit={submit} className="card p-6 space-y-4">
        <div><label className="label">Objet *</label>
          <input className="input" required value={data.title} onChange={(e) => set('title', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Societe *</label>
            <select className="input" required value={data.companyId} onChange={(e) => set('companyId', e.target.value)}>
              <option value="">-- Choisir --</option>
              {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="label">Contact</label>
            <select className="input" value={data.contactId} onChange={(e) => set('contactId', e.target.value)}>
              <option value="">--</option>
              {contacts.map((c: any) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          </div>
          <div><label className="label">Opportunite</label>
            <select className="input" value={data.opportunityId} onChange={(e) => set('opportunityId', e.target.value)}>
              <option value="">--</option>
              {opps.map((o: any) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </div>
          <div><label className="label">Valable jusqu'au *</label>
            <input type="date" className="input" required value={data.validUntil} onChange={(e) => set('validUntil', e.target.value)} />
          </div>
          <div><label className="label">TVA (%)</label>
            <input type="number" step="0.01" min={0} className="input" value={data.vatRate} onChange={(e) => set('vatRate', parseFloat(e.target.value))} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Lignes du devis *</label>
            <button type="button" className="btn btn-secondary text-xs" onClick={addLine}>
              <Plus size={14} className="mr-1" /> Ligne
            </button>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => {
              const lineTotal = l.quantity * l.unitPriceHt * (1 - (l.discountPct ?? 0) / 100);
              return (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <textarea
                    className="input col-span-5 min-h-[44px]"
                    placeholder="Description"
                    value={l.description}
                    onChange={(e) => setLine(i, 'description', e.target.value)}
                  />
                  <input type="number" step="0.01" min={0} className="input col-span-1" placeholder="Qte" value={l.quantity} onChange={(e) => setLine(i, 'quantity', parseFloat(e.target.value))} />
                  <input type="number" step="0.01" min={0} className="input col-span-2" placeholder="PU HT" value={l.unitPriceHt} onChange={(e) => setLine(i, 'unitPriceHt', parseFloat(e.target.value))} />
                  <input type="number" step="0.01" min={0} max={100} className="input col-span-1" placeholder="%" value={l.discountPct} onChange={(e) => setLine(i, 'discountPct', parseFloat(e.target.value))} />
                  <div className="col-span-2 text-sm font-medium pt-2 text-right">{formatEuro(lineTotal)}</div>
                  <button type="button" onClick={() => removeLine(i)} className="col-span-1 text-red-500 hover:text-red-700 pt-2 flex justify-center" title="Supprimer">
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t pt-4 grid grid-cols-2 gap-4">
          <div><label className="label">Notes (visible sur le PDF)</label>
            <textarea className="input min-h-[80px]" value={data.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
          <div><label className="label">Conditions / mentions (visible sur le PDF)</label>
            <textarea className="input min-h-[80px]" value={data.terms} onChange={(e) => set('terms', e.target.value)} />
          </div>
        </div>

        <div className="border-t pt-4 flex justify-end">
          <div className="text-right space-y-1 text-sm">
            <div>Sous-total HT : <span className="font-medium">{formatEuro(totals.subtotal)}</span></div>
            <div>TVA ({data.vatRate} %) : <span className="font-medium">{formatEuro(totals.vat)}</span></div>
            <div className="text-lg font-bold text-mdo-600">Total TTC : {formatEuro(totals.total)}</div>
          </div>
        </div>

        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creation...' : 'Creer le devis'}
          </button>
          <button type="button" onClick={() => router.back()} className="btn btn-secondary">Annuler</button>
        </div>
      </form>
    </div>
  );
}
