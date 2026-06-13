'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatEuro } from '@/lib/utils';
import { ProductAutocomplete } from '@/components/ProductAutocomplete';

interface Line {
  description: string;
  quantity: number;
  unitPriceHt: number;
  discountPct: number;
  productId?: string;
  stockItemId?: string;
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
  const [products, setProducts] = useState<any[]>([]);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [data, setData] = useState<any>({
    title: '',
    companyId: sp.get('companyId') ?? '',
    contactId: '',
    opportunityId: sp.get('opportunityId') ?? '',
    validUntil: new Date(Date.now() + DEFAULT_VALIDITY_DAYS * 86400000).toISOString().slice(0, 10),
    vatRate: 20,
    globalDiscountPct: 0,
    notes: '',
    terms: '',
  });
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/companies?pageSize=500').then((r) => setCompanies(r.items));
    api.get('/opportunities').then(setOpps);
    api.get('/products').then(setProducts).catch(() => setProducts([]));
    api.get('/stock/items').then((d) => setStockItems(Array.isArray(d) ? d : [])).catch(() => setStockItems([]));
    api.get('/quote-templates').then(setTemplates).catch(() => setTemplates([]));
  }, []);

  // Charge un template : remplace les lignes existantes par celles du template
  async function loadTemplate(templateId: string) {
    if (!templateId) return;
    try {
      const r = await api.get('/quote-templates/' + templateId + '/expand');
      setLines(r.lines.map((l: any) => ({
        description: l.description,
        quantity: l.quantity,
        unitPriceHt: l.unitPriceHt,
        discountPct: l.discountPct ?? 0,
        productId: l.productId,
      })));
      // Pre-remplit les conditions si pas encore set
      if (r.template.defaultTerms && !data.terms) {
        setData((d: any) => ({ ...d, terms: r.template.defaultTerms }));
      }
    } catch (err: any) {
      // toast.error pas importe ici, le selecteur se reset au prochain render
    }
  }

  function applyProduct(i: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    setLines((arr) => arr.map((l, idx) => idx === i ? {
      ...l,
      productId,
      description: p.name + (p.description ? '\n' + p.description : ''),
      unitPriceHt: p.sellingPriceHt ? Number(p.sellingPriceHt) : l.unitPriceHt,
    } : l));
  }

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
    const gd = Number(data.globalDiscountPct) || 0;
    const discounted = subtotal * (1 - gd / 100);
    const vat = discounted * ((data.vatRate ?? 20) / 100);
    return { subtotal, globalDiscount: subtotal - discounted, discounted, vat, total: discounted + vat };
  }, [lines, data.vatRate, data.globalDiscountPct]);

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
        globalDiscountPct: Number(data.globalDiscountPct) || 0,
        lines: lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPriceHt: Number(l.unitPriceHt),
          discountPct: Number(l.discountPct ?? 0),
          productId: l.productId,
          stockItemId: l.stockItemId,
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
        {templates.length > 0 && (
          <div className="bg-mdo-50 border border-mdo-200 rounded-md p-3 flex items-center gap-3">
            <span className="text-sm font-medium text-mdo-700">Charger depuis un template :</span>
            <select
              className="input flex-1 max-w-md"
              defaultValue=""
              onChange={(e) => { if (e.target.value) { loadTemplate(e.target.value); e.target.value = ''; } }}
            >
              <option value="">-- Choisir un template --</option>
              {templates.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.category ? '[' + t.category + '] ' : ''}{t.name}
                </option>
              ))}
            </select>
          </div>
        )}
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
          <div><label className="label">Remise globale (%)</label>
            <input type="number" step="0.01" min={0} max={100} className="input" value={data.globalDiscountPct} onChange={(e) => set('globalDiscountPct', parseFloat(e.target.value) || 0)} />
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
                <div key={i} className="space-y-1">
                {products.length > 0 && (
                  <ProductAutocomplete
                    products={products}
                    className="max-w-md"
                    initialLabel={(() => { const p = products.find((x: any) => x.id === l.productId); return p ? (p.code ? `[${p.code}] ${p.name}` : p.name) : ''; })()}
                    onSelect={(p) => applyProduct(i, p.id)}
                  />
                )}
                {stockItems.length > 0 && (
                  <div className="flex items-center gap-2 max-w-md">
                    <select className="input text-xs py-1" value={l.stockItemId ?? ''} onChange={(e) => setLine(i, 'stockItemId', e.target.value || undefined)}>
                      <option value="">Lier un article de stock (réservé à l'acceptation)…</option>
                      {stockItems.map((s: any) => <option key={s.id} value={s.id}>{s.sku} — {s.name} · {s.availableQty} dispo</option>)}
                    </select>
                    {l.stockItemId && (() => {
                      const s = stockItems.find((x: any) => x.id === l.stockItemId);
                      if (!s) return null;
                      const ok = s.availableQty >= l.quantity;
                      return <span className={'text-xs whitespace-nowrap ' + (ok ? 'text-emerald-600' : 'text-amber-600')}>{s.availableQty} dispo{ok ? '' : ' ⚠'}</span>;
                    })()}
                  </div>
                )}
                <div className="grid grid-cols-12 gap-2 items-start">
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
            {totals.globalDiscount > 0 && (
              <>
                <div className="text-red-600">Remise globale ({data.globalDiscountPct} %) : <span className="font-medium">- {formatEuro(totals.globalDiscount)}</span></div>
                <div>Total HT après remise : <span className="font-medium">{formatEuro(totals.discounted)}</span></div>
              </>
            )}
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
