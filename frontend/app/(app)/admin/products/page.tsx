'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2, Edit, Package, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatEuro } from '@/lib/utils';

interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  vendor: string | null;
  type: string;
  recurringPeriod: string | null;
  purchasePriceHt: number | string | null;
  sellingPriceHt: number | string | null;
  vatRate: number | string;
  category: string | null;
  isActive: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  LICENSE: 'Licence',
  HARDWARE: 'Materiel',
  SERVICE: 'Prestation',
  RECURRING: 'Abonnement',
};

function marginPct(p: Product): number | null {
  const ph = p.purchasePriceHt ? Number(p.purchasePriceHt) : null;
  const sh = p.sellingPriceHt ? Number(p.sellingPriceHt) : null;
  if (!ph || !sh || sh === 0) return null;
  return +((sh - ph) / sh * 100).toFixed(1);
}

export default function ProductsPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const confirm = useConfirm();

  async function load() {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (includeInactive) p.set('includeInactive', 'true');
    const [list, st] = await Promise.all([
      api.get('/products' + (p.toString() ? '?' + p.toString() : '')),
      api.get('/products/stats').catch(() => null),
    ]);
    setItems(list);
    if (st) setStats(st);
  }

  useEffect(() => { load(); }, [search, includeInactive]);

  async function save(form: HTMLFormElement, isNew: boolean, id?: string) {
    const f = new FormData(form);
    const payload: any = {
      code: f.get('code'),
      name: f.get('name'),
      description: f.get('description') || undefined,
      vendor: f.get('vendor') || undefined,
      type: f.get('type'),
      recurringPeriod: f.get('recurringPeriod') || undefined,
      purchasePriceHt: f.get('purchasePriceHt') ? parseFloat(f.get('purchasePriceHt') as string) : undefined,
      sellingPriceHt: f.get('sellingPriceHt') ? parseFloat(f.get('sellingPriceHt') as string) : undefined,
      vatRate: f.get('vatRate') ? parseFloat(f.get('vatRate') as string) : undefined,
      category: f.get('category') || undefined,
      isActive: f.get('isActive') === 'on',
    };
    try {
      if (isNew) await api.post('/products', payload);
      else await api.patch('/products/' + id, payload);
      toast.success(isNew ? 'Produit cree' : 'Produit modifie');
      setEditing(null);
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function remove(p: Product) {
    const ok = await confirm({
      title: 'Supprimer "' + p.name + '" ?',
      message: 'Si le produit est utilise dans un devis, la suppression sera refusee.',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try { await api.delete('/products/' + p.id); toast.success('Supprime'); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Package size={28} className="text-mdo-600" /> Catalogue produits & marges
        </h1>
        <button onClick={() => setEditing('new')} className="btn btn-primary">
          <Plus size={16} className="mr-1" /> Nouveau produit
        </button>
      </div>

      {stats && stats.vendorBreakdown.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4">
            <h3 className="font-semibold text-sm mb-3">Marge par vendor (devis acceptes)</h3>
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500 text-left"><th>Vendor</th><th className="text-right">Revenus</th><th className="text-right">Marge</th><th className="text-right">%</th></tr></thead>
              <tbody>
                {stats.vendorBreakdown.slice(0, 8).map((v: any) => (
                  <tr key={v.vendor} className="border-t">
                    <td className="py-1">{v.vendor}</td>
                    <td className="py-1 text-right">{formatEuro(v.revenue)}</td>
                    <td className="py-1 text-right text-emerald-600 font-medium">{formatEuro(v.margin)}</td>
                    <td className="py-1 text-right">{v.marginPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card p-4">
            <h3 className="font-semibold text-sm mb-3">Top 10 produits revendus</h3>
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500 text-left"><th>Produit</th><th className="text-right">Unites</th><th className="text-right">Revenus</th><th className="text-right">Marge</th></tr></thead>
              <tbody>
                {stats.topProducts.map((p: any) => (
                  <tr key={p.code} className="border-t">
                    <td className="py-1">{p.name}</td>
                    <td className="py-1 text-right">{p.units}</td>
                    <td className="py-1 text-right">{formatEuro(p.revenue)}</td>
                    <td className="py-1 text-right text-emerald-600">{formatEuro(p.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card p-4 flex items-center gap-3">
        <input className="input flex-1" placeholder="Rechercher (code, nom, description)" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          Inclure inactifs
        </label>
      </div>

      {editing === 'new' && <ProductForm onSubmit={(f) => save(f, true)} onCancel={() => setEditing(null)} />}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Code</th>
              <th className="p-3 font-medium">Nom</th>
              <th className="p-3 font-medium">Vendor</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium text-right">Achat HT</th>
              <th className="p-3 font-medium text-right">Vente HT</th>
              <th className="p-3 font-medium text-right">Marge %</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-slate-400">Catalogue vide. Creez vos produits revendus pour suivre les marges.</td></tr>
            ) : items.map((p) => (
              <>
                <tr key={p.id} className={'border-t hover:bg-slate-50 ' + (p.isActive ? '' : 'opacity-50')}>
                  <td className="p-3 font-mono text-xs">{p.code}</td>
                  <td className="p-3">
                    <div className="font-medium">{p.name}</div>
                    {p.category && <div className="text-xs text-slate-400">{p.category}</div>}
                  </td>
                  <td className="p-3 text-xs">{p.vendor ?? '-'}</td>
                  <td className="p-3 text-xs">
                    {TYPE_LABEL[p.type] ?? p.type}
                    {p.recurringPeriod && <span className="text-slate-400"> /{p.recurringPeriod}</span>}
                  </td>
                  <td className="p-3 text-right">{p.purchasePriceHt ? formatEuro(p.purchasePriceHt as any) : '-'}</td>
                  <td className="p-3 text-right">{p.sellingPriceHt ? formatEuro(p.sellingPriceHt as any) : '-'}</td>
                  <td className="p-3 text-right font-medium">
                    {(() => { const m = marginPct(p); return m !== null ? <span className={m >= 30 ? 'text-emerald-600' : m >= 0 ? 'text-amber-600' : 'text-red-600'}>{m}%</span> : '-'; })()}
                  </td>
                  <td className="p-3 text-right">
                    <button onClick={() => setEditing(p)} className="text-slate-500 hover:text-mdo-600 mr-2" title="Modifier"><Edit size={14} /></button>
                    <button onClick={() => remove(p)} className="text-red-500 hover:text-red-700" title="Supprimer"><Trash2 size={14} /></button>
                  </td>
                </tr>
                {editing && typeof editing !== 'string' && editing.id === p.id && (
                  <tr><td colSpan={8} className="p-0"><ProductForm product={p} onSubmit={(f) => save(f, false, p.id)} onCancel={() => setEditing(null)} /></td></tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProductForm({ product, onSubmit, onCancel }: { product?: Product; onSubmit: (f: HTMLFormElement) => void; onCancel: () => void }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(e.currentTarget); }} className="card p-6 space-y-4 border-mdo-200 bg-mdo-50">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{product ? 'Modifier le produit' : 'Nouveau produit'}</h2>
        <button type="button" onClick={onCancel} className="text-slate-500 hover:text-slate-700"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Code unique *</label><input name="code" required defaultValue={product?.code ?? ''} className="input" placeholder="M365_BP, BD_GZ_10..." /></div>
        <div><label className="label">Nom *</label><input name="name" required defaultValue={product?.name ?? ''} className="input" /></div>
        <div><label className="label">Vendor</label><input name="vendor" defaultValue={product?.vendor ?? ''} className="input" placeholder="Microsoft, Bitdefender..." /></div>
        <div><label className="label">Categorie</label><input name="category" defaultValue={product?.category ?? ''} className="input" placeholder="M365, Securite, Sauvegarde..." /></div>
        <div><label className="label">Type</label>
          <select name="type" defaultValue={product?.type ?? 'LICENSE'} className="input">
            <option value="LICENSE">Licence</option>
            <option value="HARDWARE">Materiel</option>
            <option value="SERVICE">Prestation</option>
            <option value="RECURRING">Abonnement</option>
          </select>
        </div>
        <div><label className="label">Periodicite (si abonnement)</label><input name="recurringPeriod" defaultValue={product?.recurringPeriod ?? ''} className="input" placeholder="mensuel, annuel" /></div>
        <div><label className="label">Prix achat HT (cout MDO)</label><input name="purchasePriceHt" type="number" step="0.01" min={0} defaultValue={product?.purchasePriceHt as any ?? ''} className="input" /></div>
        <div><label className="label">Prix vente HT (conseille)</label><input name="sellingPriceHt" type="number" step="0.01" min={0} defaultValue={product?.sellingPriceHt as any ?? ''} className="input" /></div>
        <div><label className="label">TVA %</label><input name="vatRate" type="number" step="0.01" min={0} defaultValue={(product?.vatRate as any) ?? 20} className="input" /></div>
      </div>
      <div><label className="label">Description</label><textarea name="description" defaultValue={product?.description ?? ''} className="input min-h-[60px]" /></div>
      <label className="text-sm flex items-center gap-2">
        <input type="checkbox" name="isActive" defaultChecked={product?.isActive ?? true} />
        Actif (visible dans les selecteurs de devis)
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">{product ? 'Enregistrer' : 'Creer'}</button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">Annuler</button>
      </div>
    </form>
  );
}
