'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Package, MapPin, Hash, History } from 'lucide-react';
import { api } from '@/lib/api';

const eur = (n: number) => (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const frDateTime = (s: string) => new Date(s).toLocaleString('fr-FR');
const MTYPE: Record<string, { label: string; cls: string }> = {
  IN: { label: 'Entrée', cls: 'text-emerald-700' }, OUT: { label: 'Sortie', cls: 'text-orange-700' },
  TRANSFER: { label: 'Transfert', cls: 'text-sky-700' }, ADJUSTMENT: { label: 'Inventaire', cls: 'text-slate-600' },
};
const SERIAL: Record<string, string> = { IN_STOCK: 'En stock', DEPLOYED: 'Déployé', SOLD: 'Vendu', DEFECTIVE: 'Défectueux', RETURNED: 'Retourné' };

export default function StockItemPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<any>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [newSerial, setNewSerial] = useState('');

  async function reload() {
    try { setItem(await api.get(`/stock/items/${id}`)); } catch (e: any) { toast.error(e.message); }
    try { setMovements(await api.get(`/stock/movements?itemId=${id}`)); } catch { /* */ }
  }
  useEffect(() => { if (id) reload(); }, [id]);
  useEffect(() => { api.get('/assets').then((d: any) => setAssets(Array.isArray(d) ? d : (d?.items ?? []))).catch(() => {}); }, []);

  async function addSerial() {
    if (!newSerial.trim()) return;
    try { await api.post('/stock/serials', { itemId: id, serial: newSerial.trim() }); setNewSerial(''); reload(); }
    catch (e: any) { toast.error(e.message); }
  }
  async function updateSerial(sid: string, patch: any) {
    try { await api.patch(`/stock/serials/${sid}`, patch); reload(); }
    catch (e: any) { toast.error(e.message); }
  }

  if (!item) return <div className="text-slate-400">Chargement...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/stock" className="text-sm text-slate-500 hover:text-mdo-600 inline-flex items-center gap-1"><ArrowLeft size={14} /> Retour au stock</Link>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package size={24} className="text-mdo-600" /> {item.name}</h1>
          <p className="text-sm text-slate-500 font-mono">{item.sku}{item.category ? ' · ' + item.category : ''}{item.supplier ? ' · ' + item.supplier.name : ''}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{item.totalQty} <span className="text-sm font-normal text-slate-400">{item.unit}</span></div>
          <div className="text-xs text-slate-500">PMP {eur(item.avgCostHt)} · valeur {eur(item.stockValue)}</div>
          {item.lowStock && <div className="text-xs text-red-600 font-medium">Sous le seuil ({item.reorderPoint})</div>}
        </div>
      </div>

      {/* Stock par emplacement */}
      <div className="card overflow-hidden">
        <div className="p-3 border-b font-semibold flex items-center gap-2"><MapPin size={16} /> Stock par emplacement</div>
        <table className="w-full text-sm">
          <tbody>
            {(item.levels ?? []).filter((l: any) => Number(l.quantity) !== 0).length === 0 ? (
              <tr><td className="p-4 text-center text-slate-400">Aucun stock.</td></tr>
            ) : item.levels.map((l: any) => (
              <tr key={l.id} className="border-t"><td className="p-3">{l.location?.name}</td><td className="p-3 text-right font-medium">{Number(l.quantity)} {item.unit}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Numeros de serie */}
      {item.trackSerial && (
        <div className="card overflow-hidden">
          <div className="p-3 border-b font-semibold flex items-center gap-2"><Hash size={16} /> Numéros de série</div>
          <div className="p-3 space-y-2">
            <div className="flex gap-2"><input className="input" placeholder="Ajouter un n° de série" value={newSerial} onChange={(e) => setNewSerial(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSerial()} /><button onClick={addSerial} className="btn btn-secondary">Ajouter</button></div>
            <div className="divide-y">
              {(item.serials ?? []).length === 0 && <span className="text-sm text-slate-400">Aucun.</span>}
              {(item.serials ?? []).map((s: any) => (
                <div key={s.id} className="flex items-center gap-2 py-2 flex-wrap">
                  <span className="font-mono text-xs flex-1 min-w-[8rem]">{s.serial}</span>
                  <select className="input w-auto py-1 text-xs" value={s.status} onChange={(e) => updateSerial(s.id, { status: e.target.value })}>
                    {Object.entries(SERIAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <select className="input w-auto py-1 text-xs max-w-[14rem]" value={s.assetId ?? ''} onChange={(e) => updateSerial(s.id, { assetId: e.target.value || null, status: e.target.value ? 'DEPLOYED' : s.status })}>
                    <option value="">— Asset client —</option>
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.company?.name ? a.company.name + ' · ' : ''}{a.name}</option>)}
                  </select>
                  {s.asset && <span className="text-[11px] text-emerald-600">→ {s.asset.company?.name} / {s.asset.name}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Historique */}
      <div className="card overflow-hidden">
        <div className="p-3 border-b font-semibold flex items-center gap-2"><History size={16} /> Historique des mouvements</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Type</th><th className="p-3">Emplacement</th><th className="p-3 text-right">Qté</th><th className="p-3">Motif</th></tr></thead>
          <tbody>
            {movements.length === 0 ? (
              <tr><td colSpan={5} className="p-4 text-center text-slate-400">Aucun mouvement.</td></tr>
            ) : movements.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="p-3 text-xs text-slate-500">{frDateTime(m.createdAt)}</td>
                <td className={'p-3 font-medium ' + (MTYPE[m.type]?.cls ?? '')}>{MTYPE[m.type]?.label ?? m.type}</td>
                <td className="p-3 text-slate-600">{m.location?.name}</td>
                <td className="p-3 text-right">{m.type === 'OUT' ? '-' : m.type === 'IN' ? '+' : ''}{Number(m.quantity)}</td>
                <td className="p-3 text-xs text-slate-500">{m.reason ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
