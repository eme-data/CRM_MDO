'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Boxes, Plus, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  ClipboardCheck, Settings2, Package, ShoppingCart, History, Download, RefreshCw, Clock,
} from 'lucide-react';
import { api, authedFetch } from '@/lib/api';
import { ProductAutocomplete } from '@/components/ProductAutocomplete';

interface Loc { id: string; name: string; code?: string | null; active?: boolean }
interface Sup { id: string; name: string; active?: boolean }
interface Item {
  id: string; sku: string; name: string; category: string | null; unit: string;
  avgCostHt: number; reorderPoint: number; totalQty: number; stockValue: number; lowStock: boolean;
  supplier?: { id: string; name: string } | null;
}
interface OverduePo { id: string; reference: string; supplierName: string | null; expectedDate: string | null; status: string }
interface Dash {
  itemCount: number; lowStockCount: number; stockValueHt: number; locationCount: number;
  supplierCount: number; openPoCount: number;
  overduePoCount: number; overduePos: OverduePo[];
}
interface ReorderGroup {
  supplierId: string | null; supplierName: string | null;
  lines: { itemId: string; sku: string; name: string; unit: string; totalQty: number; reorderPoint: number; suggestedQty: number; unitCostHt: number }[];
}
type Kind = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUST';

const eur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export default function StockPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [suppliers, setSuppliers] = useState<Sup[]>([]);
  const [showItem, setShowItem] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showReorder, setShowReorder] = useState(false);
  const [mv, setMv] = useState<{ item: Item; kind: Kind } | null>(null);

  async function reload() {
    try { setDash(await api.get('/stock/dashboard')); } catch { /* */ }
    try { setItems(await api.get('/stock/items')); } catch { /* */ }
    try { setLocations(await api.get('/stock/locations')); } catch { /* */ }
    try { setSuppliers(await api.get('/stock/suppliers')); } catch { /* */ }
  }
  useEffect(() => { reload(); }, []);

  async function downloadInventory() {
    try {
      const res = await authedFetch('/api/stock/inventory.csv');
      if (!res.ok) throw new Error('Export indisponible');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'inventaire-stock.csv';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold flex items-center gap-3"><Boxes size={28} className="text-mdo-600" /> Stock</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowReorder(true)} className="btn btn-secondary"><RefreshCw size={14} className="mr-1" /> Réappro</button>
          <button onClick={downloadInventory} className="btn btn-secondary"><Download size={14} className="mr-1" /> Exporter</button>
          <Link href="/stock/commandes" className="btn btn-secondary"><ShoppingCart size={14} className="mr-1" /> Commandes</Link>
          <button onClick={() => setShowConfig((v) => !v)} className="btn btn-secondary"><Settings2 size={14} className="mr-1" /> Fournisseurs & emplacements</button>
          <button onClick={() => setShowItem(true)} className="btn btn-primary"><Plus size={14} className="mr-1" /> Nouvel article</button>
        </div>
      </div>

      {/* KPIs */}
      {dash && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi icon={Package} label="Articles" value={dash.itemCount} />
          <Kpi icon={AlertTriangle} label="En stock bas" value={dash.lowStockCount} accent={dash.lowStockCount > 0} />
          <Kpi icon={Boxes} label="Valeur du stock (HT)" value={eur(dash.stockValueHt)} />
          <Kpi icon={ShoppingCart} label="Commandes en cours" value={dash.openPoCount} />
          <Kpi icon={Clock} label="Cmd. en retard" value={dash.overduePoCount ?? 0} accent={(dash.overduePoCount ?? 0) > 0} />
        </div>
      )}

      {/* Bandeau commandes fournisseurs en retard */}
      {dash && dash.overduePos && dash.overduePos.length > 0 && (
        <div className="card p-4 border-l-4 border-amber-400 bg-amber-50/50">
          <div className="font-semibold text-sm flex items-center gap-2 text-amber-800 mb-2">
            <Clock size={16} /> {dash.overduePos.length} commande(s) fournisseur en retard
          </div>
          <ul className="text-sm space-y-1">
            {dash.overduePos.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span><Link href="/stock/commandes" className="font-medium hover:text-mdo-600">{p.reference}</Link>{p.supplierName && <span className="text-slate-500"> — {p.supplierName}</span>}</span>
                <span className="text-xs text-amber-700">attendue le {p.expectedDate ? new Date(p.expectedDate).toLocaleDateString('fr-FR') : '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showConfig && <ConfigPanel locations={locations} suppliers={suppliers} onChange={reload} />}

      {/* Articles */}
      <div className="card overflow-hidden">
        <div className="p-3 border-b font-semibold flex items-center gap-2"><Package size={16} /> Articles</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="p-3">SKU</th><th className="p-3">Article</th><th className="p-3">Cat.</th>
                <th className="p-3 text-right">Stock</th><th className="p-3 text-right">PMP</th>
                <th className="p-3 text-right">Valeur</th><th className="p-3 text-right">Mouvements</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-slate-400">Aucun article. Créez-en un ou réceptionnez une commande.</td></tr>
              ) : items.map((it) => (
                <tr key={it.id} className="border-t hover:bg-slate-50">
                  <td className="p-3 font-mono text-xs">{it.sku}</td>
                  <td className="p-3"><Link href={`/stock/${it.id}`} className="font-medium hover:text-mdo-600">{it.name}</Link>{it.supplier && <div className="text-[11px] text-slate-400">{it.supplier.name}</div>}</td>
                  <td className="p-3 text-slate-500">{it.category ?? '-'}</td>
                  <td className="p-3 text-right">
                    <span className={it.lowStock ? 'text-red-600 font-semibold' : 'font-medium'}>{it.totalQty}</span>
                    <span className="text-xs text-slate-400"> {it.unit}</span>
                    {it.lowStock && <AlertTriangle size={12} className="inline ml-1 text-red-500" />}
                  </td>
                  <td className="p-3 text-right text-slate-600">{eur(it.avgCostHt)}</td>
                  <td className="p-3 text-right text-slate-600">{eur(it.stockValue)}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button onClick={() => setMv({ item: it, kind: 'IN' })} title="Entrée" className="text-emerald-600 hover:text-emerald-800 mx-1"><ArrowDownToLine size={16} /></button>
                    <button onClick={() => setMv({ item: it, kind: 'OUT' })} title="Sortie" className="text-orange-600 hover:text-orange-800 mx-1"><ArrowUpFromLine size={16} /></button>
                    <button onClick={() => setMv({ item: it, kind: 'TRANSFER' })} title="Transfert" className="text-sky-600 hover:text-sky-800 mx-1"><ArrowLeftRight size={16} /></button>
                    <button onClick={() => setMv({ item: it, kind: 'ADJUST' })} title="Inventaire" className="text-slate-500 hover:text-slate-800 mx-1"><ClipboardCheck size={16} /></button>
                    <Link href={`/stock/${it.id}`} title="Historique" className="text-slate-400 hover:text-slate-700 mx-1 inline-block"><History size={16} /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showItem && <ItemModal suppliers={suppliers} onClose={() => setShowItem(false)} onSaved={() => { setShowItem(false); reload(); }} />}
      {mv && <MovementModal item={mv.item} kind={mv.kind} locations={locations} onClose={() => setMv(null)} onSaved={() => { setMv(null); reload(); }} />}
      {showReorder && <ReorderModal onClose={() => setShowReorder(false)} onDone={() => { setShowReorder(false); reload(); }} />}
    </div>
  );
}

function ReorderModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [groups, setGroups] = useState<ReorderGroup[] | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { api.get('/stock/reorder/suggestions').then(setGroups).catch(() => setGroups([])); }, []);

  const withSupplier = (groups ?? []).filter((g) => g.supplierId);
  const noSupplier = (groups ?? []).filter((g) => !g.supplierId).flatMap((g) => g.lines);

  async function generate() {
    setGenerating(true);
    try {
      const r: any = await api.post('/stock/purchase-orders/reorder', {});
      if (r.created > 0) toast.success(r.created + ' brouillon(s) de commande créé(s)');
      else toast.info('Aucune commande générée');
      if (r.skippedNoSupplier?.length) toast.warning(r.skippedNoSupplier.length + ' article(s) sans fournisseur ignoré(s)');
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setGenerating(false); }
  }

  return (
    <Modal title="Réapprovisionnement" onClose={onClose}>
      {groups === null ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun article sous son seuil de réappro. 👍</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Articles sous leur seuil, regroupés par fournisseur. La génération crée un brouillon de commande par fournisseur (quantités modifiables ensuite).</p>
          {withSupplier.map((g) => (
            <div key={g.supplierId} className="border rounded-lg overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 text-sm font-semibold flex items-center gap-2"><ShoppingCart size={14} /> {g.supplierName}</div>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-400"><tr><th className="px-3 py-1 text-left">Article</th><th className="px-3 py-1 text-right">Stock</th><th className="px-3 py-1 text-right">Seuil</th><th className="px-3 py-1 text-right">À commander</th></tr></thead>
                <tbody>
                  {g.lines.map((l) => (
                    <tr key={l.itemId} className="border-t">
                      <td className="px-3 py-1"><span className="font-mono text-xs text-slate-400">{l.sku}</span> {l.name}</td>
                      <td className="px-3 py-1 text-right text-red-600">{l.totalQty} {l.unit}</td>
                      <td className="px-3 py-1 text-right text-slate-500">{l.reorderPoint}</td>
                      <td className="px-3 py-1 text-right font-semibold">{l.suggestedQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {noSupplier.length > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">
              {noSupplier.length} article(s) sous le seuil sans fournisseur défini ({noSupplier.map((l) => l.sku).join(', ')}) — assignez-leur un fournisseur pour générer une commande.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn btn-secondary">Fermer</button>
            <button onClick={generate} disabled={generating || withSupplier.length === 0} className="btn btn-primary">
              {generating ? 'Génération…' : 'Générer les brouillons'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Kpi({ icon: Icon, label, value, accent }: { icon: any; label: string; value: any; accent?: boolean }) {
  return (
    <div className={'card p-4 flex items-center gap-3 ' + (accent ? 'border-red-300' : '')}>
      <div className={'h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ' + (accent ? 'bg-red-100 text-red-700' : 'bg-mdo-50 text-mdo-600')}><Icon size={20} /></div>
      <div className="min-w-0"><div className="text-xl font-bold leading-tight">{value}</div><div className="text-xs text-slate-500 truncate">{label}</div></div>
    </div>
  );
}

function ItemModal({ suppliers, onClose, onSaved }: { suppliers: Sup[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ sku: '', name: '', category: '', unit: 'piece', supplierId: '', reorderPoint: '', avgCostHt: '', trackSerial: false, productId: '' });
  const [products, setProducts] = useState<any[]>([]);
  useEffect(() => { api.get('/products').then((d: any) => setProducts(Array.isArray(d) ? d : (d?.items ?? []))).catch(() => {}); }, []);

  function applyProduct(p: any) {
    setF((prev) => ({
      ...prev,
      productId: p.id,
      name: prev.name || p.name,
      sku: prev.sku || p.code || '',
      category: prev.category || p.category || '',
      avgCostHt: prev.avgCostHt || (p.purchasePriceHt != null ? String(Number(p.purchasePriceHt)) : ''),
    }));
  }
  async function save() {
    if (!f.sku.trim() || !f.name.trim()) { toast.error('SKU et nom requis'); return; }
    try {
      await api.post('/stock/items', {
        sku: f.sku.trim(), name: f.name.trim(), category: f.category || undefined, unit: f.unit || 'piece',
        supplierId: f.supplierId || undefined, reorderPoint: f.reorderPoint ? Number(f.reorderPoint) : undefined,
        avgCostHt: f.avgCostHt ? Number(f.avgCostHt) : undefined,
        trackSerial: f.trackSerial, productId: f.productId || undefined,
      });
      toast.success('Article créé'); onSaved();
    } catch (e: any) { toast.error(e.message); }
  }
  return (
    <Modal title="Nouvel article" onClose={onClose}>
      {products.length > 0 && (
        <div className="mb-3">
          <label className="text-xs text-slate-500 mb-1 block">Pré-remplir depuis le catalogue produits (optionnel)</label>
          <ProductAutocomplete products={products} onSelect={applyProduct} />
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <input className="input" placeholder="SKU *" value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} />
        <input className="input" placeholder="Nom *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="input" placeholder="Catégorie" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
        <input className="input" placeholder="Unité (piece, metre...)" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
        <select className="input" value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })}>
          <option value="">Fournisseur (optionnel)</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input className="input" type="number" placeholder="Seuil de réappro" value={f.reorderPoint} onChange={(e) => setF({ ...f, reorderPoint: e.target.value })} />
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.trackSerial} onChange={(e) => setF({ ...f, trackSerial: e.target.checked })} /> Suivi par numéro de série</label>
      </div>
      <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="btn btn-secondary">Annuler</button><button onClick={save} className="btn btn-primary">Créer</button></div>
    </Modal>
  );
}

function MovementModal({ item, kind, locations, onClose, onSaved }:
  { item: Item; kind: Kind; locations: Loc[]; onClose: () => void; onSaved: () => void }) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [toLocationId, setToLocationId] = useState(locations[1]?.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [unitCostHt, setUnitCostHt] = useState(String(item.avgCostHt || ''));
  const [reason, setReason] = useState('');
  const titles: Record<Kind, string> = { IN: 'Entrée de stock', OUT: 'Sortie de stock', TRANSFER: 'Transfert', ADJUST: 'Inventaire (correction)' };

  async function submit() {
    const q = Number(quantity);
    if (kind !== 'ADJUST' && (!q || q <= 0)) { toast.error('Quantité invalide'); return; }
    if (!locationId) { toast.error('Emplacement requis'); return; }
    try {
      if (kind === 'IN' || kind === 'OUT') {
        await api.post('/stock/movements', { itemId: item.id, locationId, type: kind, quantity: q, unitCostHt: kind === 'IN' ? Number(unitCostHt) || undefined : undefined, reason: reason || undefined });
      } else if (kind === 'TRANSFER') {
        if (!toLocationId || toLocationId === locationId) { toast.error('Choisissez 2 emplacements différents'); return; }
        await api.post('/stock/transfer', { itemId: item.id, fromLocationId: locationId, toLocationId, quantity: q, reason: reason || undefined });
      } else {
        await api.post('/stock/adjust', { itemId: item.id, locationId, countedQuantity: Number(quantity), reason: reason || undefined });
      }
      toast.success('Mouvement enregistré'); onSaved();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <Modal title={`${titles[kind]} — ${item.name}`} onClose={onClose}>
      {locations.length === 0 ? (
        <p className="text-sm text-amber-600">Créez d'abord un emplacement (bouton « Fournisseurs & emplacements »).</p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">{kind === 'TRANSFER' ? 'Emplacement source' : 'Emplacement'}</label>
            <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {kind === 'TRANSFER' && (
            <div>
              <label className="label">Emplacement destination</label>
              <select className="input" value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
                <option value="">Choisir...</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">{kind === 'ADJUST' ? 'Quantité réelle constatée' : 'Quantité'}</label>
              <input className="input" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" />
            </div>
            {kind === 'IN' && (
              <div>
                <label className="label">Coût unitaire HT</label>
                <input className="input" type="number" value={unitCostHt} onChange={(e) => setUnitCostHt(e.target.value)} placeholder="0.00" />
              </div>
            )}
          </div>
          <input className="input" placeholder="Motif / référence (optionnel)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex justify-end gap-2"><button onClick={onClose} className="btn btn-secondary">Annuler</button><button onClick={submit} className="btn btn-primary">Valider</button></div>
        </div>
      )}
    </Modal>
  );
}

function ConfigPanel({ locations, suppliers, onChange }: { locations: Loc[]; suppliers: Sup[]; onChange: () => void }) {
  const [locName, setLocName] = useState('');
  const [supName, setSupName] = useState('');
  async function addLoc() { if (!locName.trim()) return; try { await api.post('/stock/locations', { name: locName.trim() }); setLocName(''); onChange(); } catch (e: any) { toast.error(e.message); } }
  async function addSup() { if (!supName.trim()) return; try { await api.post('/stock/suppliers', { name: supName.trim() }); setSupName(''); onChange(); } catch (e: any) { toast.error(e.message); } }
  return (
    <div className="card p-4 grid md:grid-cols-2 gap-6 bg-slate-50/50">
      <div>
        <div className="font-semibold text-sm mb-2">Emplacements</div>
        <ul className="text-sm space-y-1 mb-2">{locations.map((l) => <li key={l.id} className="text-slate-700">• {l.name}</li>)}{locations.length === 0 && <li className="text-slate-400">Aucun</li>}</ul>
        <div className="flex gap-2"><input className="input" placeholder="Nouvel emplacement" value={locName} onChange={(e) => setLocName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLoc()} /><button onClick={addLoc} className="btn btn-secondary"><Plus size={14} /></button></div>
      </div>
      <div>
        <div className="font-semibold text-sm mb-2">Fournisseurs</div>
        <ul className="text-sm space-y-1 mb-2">{suppliers.map((s) => <li key={s.id} className="text-slate-700">• {s.name}</li>)}{suppliers.length === 0 && <li className="text-slate-400">Aucun</li>}</ul>
        <div className="flex gap-2"><input className="input" placeholder="Nouveau fournisseur" value={supName} onChange={(e) => setSupName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSup()} /><button onClick={addSup} className="btn btn-secondary"><Plus size={14} /></button></div>
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}
