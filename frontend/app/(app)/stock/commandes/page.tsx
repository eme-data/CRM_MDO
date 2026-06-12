'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ShoppingCart, Plus, ArrowLeft, ChevronDown, ChevronRight, X, PackageCheck } from 'lucide-react';
import { api } from '@/lib/api';

const eur = (n: number) => (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const frDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('fr-FR') : '-');
const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Brouillon', cls: 'bg-slate-100 text-slate-600' },
  ORDERED: { label: 'Commandée', cls: 'bg-sky-100 text-sky-700' },
  PARTIAL: { label: 'Partielle', cls: 'bg-amber-100 text-amber-800' },
  RECEIVED: { label: 'Reçue', cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED: { label: 'Annulée', cls: 'bg-red-100 text-red-700' },
};

export default function CommandesPage() {
  const [pos, setPos] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  async function reload() {
    try { setPos(await api.get('/stock/purchase-orders')); } catch { /* */ }
    try { setItems(await api.get('/stock/items')); } catch { /* */ }
    try { setSuppliers(await api.get('/stock/suppliers')); } catch { /* */ }
    try { setLocations(await api.get('/stock/locations')); } catch { /* */ }
  }
  useEffect(() => { reload(); }, []);

  return (
    <div className="space-y-6 max-w-5xl">
      <Link href="/stock" className="text-sm text-slate-500 hover:text-mdo-600 inline-flex items-center gap-1"><ArrowLeft size={14} /> Retour au stock</Link>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold flex items-center gap-3"><ShoppingCart size={28} className="text-mdo-600" /> Commandes fournisseurs</h1>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary"><Plus size={14} className="mr-1" /> Nouvelle commande</button>
      </div>

      {pos.length === 0 ? <p className="text-sm text-slate-400">Aucune commande.</p> : pos.map((po) => (
        <PoCard key={po.id} po={po} open={!!open[po.id]} toggle={() => setOpen((s) => ({ ...s, [po.id]: !s[po.id] }))} onChange={reload} />
      ))}

      {showCreate && <CreatePoModal items={items} suppliers={suppliers} locations={locations} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); reload(); }} />}
    </div>
  );
}

function PoCard({ po, open, toggle, onChange }: { po: any; open: boolean; toggle: () => void; onChange: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [recv, setRecv] = useState<Record<string, string>>({});
  useEffect(() => { if (open && !detail) api.get(`/stock/purchase-orders/${po.id}`).then(setDetail).catch(() => {}); }, [open]);

  async function setStatus(status: string) {
    try { await api.post(`/stock/purchase-orders/${po.id}/status`, { status }); onChange(); }
    catch (e: any) { toast.error(e.message); }
  }
  async function receive() {
    const lines = Object.entries(recv).filter(([, v]) => Number(v) > 0).map(([lineId, v]) => ({ lineId, quantityReceived: Number(v) }));
    if (lines.length === 0) { toast.error('Saisissez au moins une quantité reçue'); return; }
    try { const updated = await api.post(`/stock/purchase-orders/${po.id}/receive`, { lines }); setDetail(updated); setRecv({}); toast.success('Réception enregistrée'); onChange(); }
    catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="card overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50">
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="font-mono text-sm">{po.reference}</span>
        <span className="font-medium">{po.supplier?.name}</span>
        <span className="text-xs text-slate-400">{po.location?.name}</span>
        <span className="ml-auto text-sm text-slate-600">{eur(po.totalHt)}</span>
        <span className={'badge ' + (STATUS[po.status]?.cls ?? '')}>{STATUS[po.status]?.label}</span>
      </button>
      {open && detail && (
        <div className="p-4 border-t space-y-3">
          <div className="text-xs text-slate-500">Commandée le {frDate(detail.orderDate)} · attendue le {frDate(detail.expectedDate)}</div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500"><tr><th className="py-1">Article</th><th className="py-1 text-right">Commandé</th><th className="py-1 text-right">Reçu</th><th className="py-1 text-right">PU HT</th>{detail.status !== 'RECEIVED' && detail.status !== 'CANCELLED' && <th className="py-1 text-right">Recevoir</th>}</tr></thead>
            <tbody>
              {detail.lines.map((l: any) => {
                const remaining = Number(l.quantityOrdered) - Number(l.quantityReceived);
                return (
                  <tr key={l.id} className="border-t">
                    <td className="py-2">{l.item?.name} <span className="text-xs text-slate-400 font-mono">{l.item?.sku}</span></td>
                    <td className="py-2 text-right">{Number(l.quantityOrdered)}</td>
                    <td className="py-2 text-right">{Number(l.quantityReceived)}</td>
                    <td className="py-2 text-right text-slate-600">{eur(Number(l.unitCostHt))}</td>
                    {detail.status !== 'RECEIVED' && detail.status !== 'CANCELLED' && (
                      <td className="py-2 text-right">
                        {remaining > 0 ? <input className="input w-20 py-1 text-right" type="number" max={remaining} placeholder={String(remaining)} value={recv[l.id] ?? ''} onChange={(e) => setRecv({ ...recv, [l.id]: e.target.value })} /> : <span className="text-emerald-600 text-xs">complet</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {detail.notes && <p className="text-xs text-slate-500">{detail.notes}</p>}
          <div className="flex gap-2 justify-end">
            {detail.status === 'DRAFT' && <button onClick={() => setStatus('ORDERED')} className="btn btn-secondary">Marquer commandée</button>}
            {detail.status !== 'RECEIVED' && detail.status !== 'CANCELLED' && <button onClick={() => setStatus('CANCELLED')} className="btn btn-secondary text-red-600">Annuler</button>}
            {(detail.status === 'ORDERED' || detail.status === 'PARTIAL' || detail.status === 'DRAFT') && <button onClick={receive} className="btn btn-primary"><PackageCheck size={14} className="mr-1" /> Réceptionner</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function CreatePoModal({ items, suppliers, locations, onClose, onSaved }:
  { items: any[]; suppliers: any[]; locations: any[]; onClose: () => void; onSaved: () => void }) {
  const [supplierId, setSupplierId] = useState('');
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<{ itemId: string; quantityOrdered: string; unitCostHt: string }[]>([{ itemId: '', quantityOrdered: '', unitCostHt: '' }]);

  function setLine(i: number, patch: any) { setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l))); }
  function onItem(i: number, itemId: string) {
    const it = items.find((x) => x.id === itemId);
    setLine(i, { itemId, unitCostHt: it && it.avgCostHt ? String(it.avgCostHt) : lines[i].unitCostHt });
  }
  async function save() {
    const goodLines = lines.filter((l) => l.itemId && Number(l.quantityOrdered) > 0)
      .map((l) => ({ itemId: l.itemId, quantityOrdered: Number(l.quantityOrdered), unitCostHt: Number(l.unitCostHt) || 0 }));
    if (!supplierId || !locationId || goodLines.length === 0) { toast.error('Fournisseur, emplacement et au moins une ligne requis'); return; }
    try {
      await api.post('/stock/purchase-orders', { supplierId, locationId, expectedDate: expectedDate || undefined, notes: notes || undefined, lines: goodLines });
      toast.success('Commande créée'); onSaved();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-4">Nouvelle commande fournisseur</h3>
        {suppliers.length === 0 || locations.length === 0 ? (
          <p className="text-sm text-amber-600">Créez d'abord un fournisseur et un emplacement (page Stock → « Fournisseurs & emplacements »).</p>
        ) : (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Fournisseur *</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
              <input className="input" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} title="Date attendue" />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-500">Lignes</div>
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select className="input flex-1" value={l.itemId} onChange={(e) => onItem(i, e.target.value)}><option value="">Article...</option>{items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.sku})</option>)}</select>
                  <input className="input w-20" type="number" placeholder="Qté" value={l.quantityOrdered} onChange={(e) => setLine(i, { quantityOrdered: e.target.value })} />
                  <input className="input w-24" type="number" placeholder="PU HT" value={l.unitCostHt} onChange={(e) => setLine(i, { unitCostHt: e.target.value })} />
                  <button onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} className="text-slate-300 hover:text-red-500"><X size={16} /></button>
                </div>
              ))}
              <button onClick={() => setLines((ls) => [...ls, { itemId: '', quantityOrdered: '', unitCostHt: '' }])} className="text-sm text-mdo-600 hover:underline flex items-center gap-1"><Plus size={14} /> Ajouter une ligne</button>
            </div>
            <input className="input" placeholder="Notes (optionnel)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="flex justify-end gap-2"><button onClick={onClose} className="btn btn-secondary">Annuler</button><button onClick={save} className="btn btn-primary">Créer la commande</button></div>
          </div>
        )}
      </div>
    </div>
  );
}
