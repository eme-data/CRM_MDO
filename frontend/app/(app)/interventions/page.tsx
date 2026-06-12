'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Wrench, Package, Trash2, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableRowSkeleton } from '@/components/ui/Skeleton';
import { useReloadOnFocus } from '@/lib/useReloadOnFocus';
import { me as fetchMe } from '@/lib/auth';
import { hasFeature } from '@/lib/modules';

const STATUS_COLOR: Record<string, string> = {
  PLANNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  DONE: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-700',
};
const eur = (n: number) => (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export default function InterventionsPage() {
  const [items, setItems] = useState<any[] | null>(null);
  const [canStock, setCanStock] = useState(false);
  const [material, setMaterial] = useState<any | null>(null);
  function load() { api.get('/interventions').then(setItems); }
  useEffect(() => { load(); }, []);
  useEffect(() => { fetchMe().then((u) => setCanStock(hasFeature(u.modules, 'stock.inventory'))).catch(() => {}); }, []);
  useReloadOnFocus(load);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Interventions</h1>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-700 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Titre</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Technicien</th>
              <th className="p-3 font-medium">Statut</th>
              {canStock && <th className="p-3 font-medium text-right">Matériel</th>}
            </tr>
          </thead>
          <tbody>
            {items === null ? (
              Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} cols={canStock ? 7 : 6} />)
            ) : items.length === 0 ? (
              <tr><td colSpan={canStock ? 7 : 6} className="p-0">
                <EmptyState icon={Wrench} title="Aucune intervention" description="Les interventions planifiees et historiques chez vos clients apparaitront ici." />
              </td></tr>
            ) : items.map((i) => (
              <tr key={i.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <td className="p-3">{formatDateTime(i.scheduledAt)}</td>
                <td className="p-3 font-medium">{i.title}</td>
                <td className="p-3">{i.company && <Link href={'/companies/' + i.company.id} className="text-mdo-600 hover:underline">{i.company.name}</Link>}</td>
                <td className="p-3">{i.type}</td>
                <td className="p-3">{i.technician ? i.technician.firstName + ' ' + i.technician.lastName : '-'}</td>
                <td className="p-3"><span className={'badge ' + STATUS_COLOR[i.status]}>{i.status}</span></td>
                {canStock && (
                  <td className="p-3 text-right">
                    <button onClick={() => setMaterial(i)} className="text-mdo-600 hover:text-mdo-800 inline-flex items-center gap-1 text-xs"><Package size={14} /> Matériel</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {material && <MaterialModal intervention={material} onClose={() => setMaterial(null)} />}
    </div>
  );
}

function MaterialModal({ intervention, onClose }: { intervention: any; onClose: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [itemId, setItemId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [qty, setQty] = useState('');

  async function reload() {
    try { setRows(await api.get(`/stock/consumptions?interventionId=${intervention.id}`)); } catch { /* */ }
  }
  useEffect(() => {
    reload();
    api.get('/stock/items').then((d: any) => setStockItems(d)).catch(() => {});
    api.get('/stock/locations').then((d: any) => { setLocations(d); if (d[0]) setLocationId(d[0].id); }).catch(() => {});
  }, []);

  async function add() {
    if (!itemId || !locationId || !(Number(qty) > 0)) { toast.error('Article, emplacement et quantité requis'); return; }
    try {
      await api.post('/stock/consume', { interventionId: intervention.id, itemId, locationId, quantity: Number(qty) });
      toast.success('Matériel décompté du stock'); setItemId(''); setQty(''); reload();
      api.get('/stock/items').then((d: any) => setStockItems(d)).catch(() => {});
    } catch (e: any) { toast.error(e.message); }
  }
  async function remove(id: string) {
    try { await api.delete(`/stock/consumptions/${id}`); toast.success('Restitué au stock'); reload(); }
    catch (e: any) { toast.error(e.message); }
  }

  const total = rows.reduce((s, r) => s + (r.totalHt ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-1 flex items-center gap-2"><Package size={18} /> Matériel consommé</h3>
        <p className="text-xs text-slate-500 mb-4">{intervention.title}{intervention.company ? ' — ' + intervention.company.name : ''}</p>

        <div className="space-y-1 mb-4">
          {rows.length === 0 ? <p className="text-sm text-slate-400">Aucun matériel décompté.</p> : rows.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-sm border-b py-1.5">
              <span className="flex-1">{r.item?.name} <span className="text-xs text-slate-400 font-mono">{r.item?.sku}</span></span>
              <span className="text-slate-600">{r.quantity} {r.item?.unit}</span>
              <span className="text-xs text-slate-400">{eur(r.totalHt)}</span>
              <button onClick={() => remove(r.id)} className="text-slate-300 hover:text-red-500" title="Restituer au stock"><Trash2 size={14} /></button>
            </div>
          ))}
          {rows.length > 0 && <div className="flex justify-end text-sm font-medium pt-1">Total : {eur(total)}</div>}
        </div>

        {locations.length === 0 || stockItems.length === 0 ? (
          <p className="text-sm text-amber-600">Créez d'abord des articles et un emplacement dans le module Stock.</p>
        ) : (
          <div className="flex gap-2 items-center border-t pt-3">
            <select className="input flex-1" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">Article...</option>
              {stockItems.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.totalQty} {it.unit})</option>)}
            </select>
            <select className="input w-32" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <input className="input w-16" type="number" placeholder="Qté" value={qty} onChange={(e) => setQty(e.target.value)} />
            <button onClick={add} className="btn btn-primary whitespace-nowrap"><Plus size={14} /></button>
          </div>
        )}
        <div className="flex justify-end mt-4"><button onClick={onClose} className="btn btn-secondary">Fermer</button></div>
      </div>
    </div>
  );
}
