'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2, Edit, FileSignature, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatEuro, contractOfferLabel } from '@/lib/utils';

interface Line {
  description: string;
  quantity: number;
  unitPriceHt: number;
  discountPct: number;
  productId?: string;
  product?: { id: string; code: string; name: string } | null;
}
interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  offer: string | null;
  defaultTerms: string | null;
  isActive: boolean;
  lines: Array<Line & { id: string; position: number }>;
  _count: { lines: number };
}

export default function QuoteTemplatesPage() {
  const [items, setItems] = useState<Template[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const confirm = useConfirm();

  async function load() {
    setItems(await api.get('/quote-templates?includeInactive=true'));
  }

  useEffect(() => {
    load();
    api.get('/products').then(setProducts).catch(() => setProducts([]));
  }, []);

  async function remove(t: Template) {
    const ok = await confirm({ title: 'Supprimer "' + t.name + '" ?', confirmLabel: 'Supprimer', tone: 'danger' });
    if (!ok) return;
    try { await api.delete('/quote-templates/' + t.id); toast.success('Supprime'); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <FileSignature size={28} className="text-mdo-600" /> Templates devis
        </h1>
        <button onClick={() => setEditing('new')} className="btn btn-primary"><Plus size={16} className="mr-1" /> Nouveau</button>
      </div>

      <p className="text-sm text-slate-500">
        Modeles pre-remplis charges en 1 clic depuis la page nouveau devis.
        Si une ligne est liee au catalogue produits, le prix de vente actuel
        est utilise (le template ne s'embete pas a tracker les prix).
      </p>

      {editing === 'new' && <TemplateForm products={products} onSave={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}

      <div className="space-y-3">
        {items.map((t) => (
          <div key={t.id} className={'card p-4 ' + (t.isActive ? '' : 'opacity-50')}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold">{t.name}</h3>
                  {t.category && <span className="badge bg-slate-100 text-slate-700">{t.category}</span>}
                  {t.offer && <span className="badge bg-mdo-100 text-mdo-700">{contractOfferLabel[t.offer]}</span>}
                  {!t.isActive && <span className="badge bg-red-100 text-red-700">Inactif</span>}
                </div>
                {t.description && <p className="text-sm text-slate-500 mt-1">{t.description}</p>}
                <p className="text-xs text-slate-400 mt-1">{t._count.lines} ligne(s)</p>
                <ul className="mt-2 text-xs text-slate-600 space-y-0.5">
                  {t.lines.map((l) => (
                    <li key={l.id}>
                      <strong>{Number(l.quantity)}x</strong> {l.description.slice(0, 80)}
                      {l.product && <span className="text-mdo-500"> [{l.product.code}]</span>}
                      <span className="text-slate-400"> — {formatEuro(Number(l.unitPriceHt))}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(t)} className="text-slate-500 hover:text-mdo-600"><Edit size={14} /></button>
                <button onClick={() => remove(t)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
              </div>
            </div>
            {editing && typeof editing !== 'string' && editing.id === t.id && (
              <div className="mt-4 pt-4 border-t">
                <TemplateForm template={t} products={products} onSave={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-slate-400">Aucun template. Creez vos modeles d'offres standards (Pack Essentiel 5 utilisateurs, Audit cyber initial, etc.).</p>}
      </div>
    </div>
  );
}

function TemplateForm({ template, products, onSave, onCancel }: { template?: Template; products: any[]; onSave: () => void; onCancel: () => void }) {
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [category, setCategory] = useState(template?.category ?? '');
  const [offer, setOffer] = useState(template?.offer ?? '');
  const [defaultTerms, setDefaultTerms] = useState(template?.defaultTerms ?? '');
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [lines, setLines] = useState<Line[]>(template?.lines ?? [{ description: '', quantity: 1, unitPriceHt: 0, discountPct: 0 }]);

  function setLine(i: number, k: keyof Line, v: any) {
    setLines((arr) => arr.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  }
  function addLine() { setLines((arr) => [...arr, { description: '', quantity: 1, unitPriceHt: 0, discountPct: 0 }]); }
  function removeLine(i: number) { setLines((arr) => arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr); }

  function applyProduct(i: number, productId: string) {
    const p = products.find((x: any) => x.id === productId);
    if (!p) return;
    setLines((arr) => arr.map((l, idx) => idx === i ? {
      ...l,
      productId,
      description: p.name + (p.description ? '\n' + p.description : ''),
      unitPriceHt: p.sellingPriceHt ? Number(p.sellingPriceHt) : l.unitPriceHt,
    } : l));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.some((l) => !l.description || l.quantity <= 0)) {
      toast.error('Toutes les lignes doivent avoir une description et une quantite > 0');
      return;
    }
    const payload = {
      name,
      description: description || undefined,
      category: category || undefined,
      offer: offer || null,
      defaultTerms: defaultTerms || undefined,
      isActive,
      lines: lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unitPriceHt: Number(l.unitPriceHt),
        discountPct: Number(l.discountPct ?? 0),
        productId: l.productId,
      })),
    };
    try {
      if (template) await api.patch('/quote-templates/' + template.id, payload);
      else await api.post('/quote-templates', payload);
      toast.success('Template enregistre');
      onSave();
    } catch (err: any) { toast.error(err.message); }
  }

  return (
    <form onSubmit={submit} className="card p-6 space-y-4 border-mdo-200 bg-mdo-50">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{template ? 'Modifier le template' : 'Nouveau template'}</h2>
        <button type="button" onClick={onCancel} className="text-slate-500"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Nom *</label><input required value={name} onChange={(e) => setName(e.target.value)} className="input" /></div>
        <div><label className="label">Categorie</label><input value={category} onChange={(e) => setCategory(e.target.value)} className="input" placeholder="Offres standards, Add-ons, Audits..." /></div>
        <div><label className="label">Offre cible</label>
          <select value={offer} onChange={(e) => setOffer(e.target.value)} className="input">
            <option value="">— Toutes —</option>
            <option value="MDO_ESSENTIEL">MDO Essentiel</option>
            <option value="MDO_PRO">MDO Pro</option>
            <option value="MDO_SOUVERAIN">MDO Souverain</option>
            <option value="CUSTOM">Sur mesure</option>
          </select>
        </div>
        <div><label className="label">Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} className="input" /></div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Lignes</label>
          <button type="button" onClick={addLine} className="btn btn-secondary text-xs"><Plus size={12} className="mr-1" /> Ligne</button>
        </div>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="space-y-1">
              {products.length > 0 && (
                <select className="input text-xs py-1 max-w-md" value={l.productId ?? ''} onChange={(e) => e.target.value && applyProduct(i, e.target.value)}>
                  <option value="">-- Lier au catalogue (optionnel) --</option>
                  {products.map((p: any) => (
                    <option key={p.id} value={p.id}>[{p.code}] {p.name}{p.sellingPriceHt ? ' — ' + Number(p.sellingPriceHt) + ' EUR' : ''}</option>
                  ))}
                </select>
              )}
              <div className="grid grid-cols-12 gap-2 items-start">
                <textarea className="input col-span-6 min-h-[44px]" placeholder="Description" value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} required />
                <input type="number" step="0.01" min={0} className="input col-span-1" placeholder="Qte" value={l.quantity} onChange={(e) => setLine(i, 'quantity', parseFloat(e.target.value))} />
                <input type="number" step="0.01" min={0} className="input col-span-2" placeholder="PU HT" value={l.unitPriceHt} onChange={(e) => setLine(i, 'unitPriceHt', parseFloat(e.target.value))} />
                <input type="number" step="0.01" min={0} max={100} className="input col-span-2" placeholder="Remise %" value={l.discountPct} onChange={(e) => setLine(i, 'discountPct', parseFloat(e.target.value))} />
                <button type="button" onClick={() => removeLine(i)} className="col-span-1 text-red-500 pt-2 flex justify-center"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div><label className="label">Conditions par defaut (visible sur le devis)</label>
        <textarea value={defaultTerms} onChange={(e) => setDefaultTerms(e.target.value)} className="input min-h-[60px]" placeholder="Validite 30 jours, paiement 30 jours net, ..." />
      </div>

      <label className="text-sm flex items-center gap-2">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Actif (visible dans le selecteur de templates devis)
      </label>

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">{template ? 'Enregistrer' : 'Creer'}</button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">Annuler</button>
      </div>
    </form>
  );
}
