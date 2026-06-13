'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, ChevronLeft, ChevronRight, Shield, ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { me as fetchMe, User } from '@/lib/auth';
import { formatDateTime } from '@/lib/utils';

const ENTITIES = ['', 'Company', 'Contact', 'Opportunity', 'Contract', 'Ticket', 'User'];
const ACTIONS = ['', 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'COMMENT', 'RENEW', 'TERMINATE', 'SYNC_REGISTRY'];

const ACTION_COLOR: Record<string, string> = {
  CREATE: 'bg-emerald-100 text-emerald-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  LOGIN: 'bg-slate-100 text-slate-700',
  COMMENT: 'bg-purple-100 text-purple-700',
  RENEW: 'bg-amber-100 text-amber-700',
  TERMINATE: 'bg-red-100 text-red-700',
  SYNC_REGISTRY: 'bg-mdo-100 text-mdo-700',
};

export default function AdminActivityPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ entity: '', action: '', userId: '', from: '', to: '' });
  const [page, setPage] = useState(0);
  const [chainStats, setChainStats] = useState<any>(null);
  const [me, setMe] = useState<User | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; verified: number; breaks: any[] } | null>(null);
  const limit = 50;

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.entity) params.set('entity', filters.entity);
      if (filters.action) params.set('action', filters.action);
      if (filters.userId) params.set('userId', filters.userId);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));
      const res = await api.get('/activities?' + params.toString());
      setItems(res.items);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }

  async function loadChainStats() {
    try { setChainStats(await api.get('/audit/chain/stats')); }
    catch { setChainStats(null); }
  }

  useEffect(() => {
    api.get('/users').then(setUsers).catch(() => {});
    loadChainStats();
    fetchMe().then(setMe).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [filters, page]);

  async function verify() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await api.post('/audit/chain/verify');
      setVerifyResult(res);
      if (res.ok) toast.success('Chaine integre — ' + res.verified + ' entries verifiees');
      else toast.error(res.breaks.length + ' alteration(s) detectee(s) !');
    } catch (err: any) { toast.error(err.message); }
    finally { setVerifying(false); }
  }

  async function forceSeal() {
    try {
      const res = await api.post('/audit/chain/seal');
      toast.success(res.sealed + ' entries scellees');
      loadChainStats();
    } catch (err: any) { toast.error(err.message); }
  }

  function set(k: string, v: string) {
    setPage(0);
    setFilters((f) => ({ ...f, [k]: v }));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Journal d'activite</h1>

      {chainStats && (
        <div className={'card p-4 border-l-4 ' + (verifyResult?.ok === false ? 'border-red-400 bg-red-50/50' : 'border-mdo-300 bg-mdo-50/50')}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              {verifyResult?.ok === false ? <ShieldAlert size={24} className="text-red-600 mt-1" /> : <Shield size={24} className="text-mdo-600 mt-1" />}
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  Chaine d'integrite SHA-256
                  {verifyResult && (
                    verifyResult.ok
                      ? <span className="badge bg-emerald-100 text-emerald-700 inline-flex items-center gap-1"><ShieldCheck size={11} /> Verifiee</span>
                      : <span className="badge bg-red-100 text-red-700">{verifyResult.breaks.length} alteration(s)</span>
                  )}
                </h2>
                <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                  <div><strong>{chainStats.sealed}</strong> entries scellees · <strong>{chainStats.pending}</strong> en attente de scellement</div>
                  {chainStats.lastSequence && (
                    <div>Derniere sequence : <code className="bg-white px-1 rounded">{chainStats.lastSequence}</code> · hash <code className="bg-white px-1 rounded">{chainStats.lastHash?.slice(0, 16)}...</code></div>
                  )}
                </div>
              </div>
            </div>
            {/* Verifier/sceller agissent sur la chaine GLOBALE de l'instance
                -> reserve au super-admin (backend : SuperAdminGuard). */}
            {me?.isSuperAdmin && (
              <div className="flex gap-2">
                <button onClick={forceSeal} className="btn btn-secondary text-xs">
                  <RefreshCw size={12} className="mr-1" /> Sceller maintenant
                </button>
                <button onClick={verify} disabled={verifying} className="btn btn-primary text-xs">
                  <ShieldCheck size={12} className="mr-1" /> {verifying ? 'Verification...' : 'Verifier l\'integrite'}
                </button>
              </div>
            )}
          </div>
          {verifyResult && verifyResult.breaks.length > 0 && (
            <div className="mt-3 pt-3 border-t border-red-200">
              <h3 className="text-sm font-semibold text-red-700 mb-2">Alterations detectees</h3>
              <ul className="text-xs space-y-1">
                {verifyResult.breaks.slice(0, 10).map((b: any, i: number) => (
                  <li key={i} className="font-mono">
                    seq #{b.sequence} ({b.activityId.slice(0, 8)}) : {b.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="card p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label className="label">Entite</label>
          <select className="input" value={filters.entity} onChange={(e) => set('entity', e.target.value)}>
            {ENTITIES.map((x) => <option key={x} value={x}>{x || 'Toutes'}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Action</label>
          <select className="input" value={filters.action} onChange={(e) => set('action', e.target.value)}>
            {ACTIONS.map((x) => <option key={x} value={x}>{x || 'Toutes'}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Utilisateur</label>
          <select className="input" value={filters.userId} onChange={(e) => set('userId', e.target.value)}>
            <option value="">Tous</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Du</label>
          <input type="date" className="input" value={filters.from} onChange={(e) => set('from', e.target.value)} />
        </div>
        <div>
          <label className="label">Au</label>
          <input type="date" className="input" value={filters.to} onChange={(e) => set('to', e.target.value)} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Seq</th>
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Utilisateur</th>
              <th className="p-3 font-medium">Action</th>
              <th className="p-3 font-medium">Entite</th>
              <th className="p-3 font-medium">Cible</th>
              <th className="p-3 font-medium">Hash</th>
              <th className="p-3 font-medium">Metadonnees</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="p-6 text-center text-slate-400">Chargement...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-slate-400">Aucune entree</td></tr>
            ) : items.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-3 font-mono text-xs">
                  {a.sequence ? (
                    <span className="text-emerald-600" title="Entry scellee">#{a.sequence}</span>
                  ) : (
                    <span className="text-slate-400" title="En attente de scellement">·</span>
                  )}
                </td>
                <td className="p-3 whitespace-nowrap">{formatDateTime(a.createdAt)}</td>
                <td className="p-3">{a.user.firstName} {a.user.lastName}</td>
                <td className="p-3">
                  <span className={'badge ' + (ACTION_COLOR[a.action] ?? 'bg-slate-100 text-slate-700')}>
                    {a.action}
                  </span>
                </td>
                <td className="p-3">{a.entity}</td>
                <td className="p-3">
                  {a.entity && a.entityId && (
                    <Link href={'/' + a.entity.toLowerCase() + 's/' + a.entityId} className="text-mdo-600 hover:underline font-mono text-xs">
                      {a.entityId.slice(0, 8)}...
                    </Link>
                  )}
                </td>
                <td className="p-3 font-mono text-[10px] text-slate-400" title={a.currentHash ?? ''}>
                  {a.currentHash ? a.currentHash.slice(0, 12) : '-'}
                </td>
                <td className="p-3 text-xs text-slate-500 font-mono max-w-xs truncate">
                  {a.metadata ? JSON.stringify(a.metadata) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between p-3 border-t bg-slate-50 text-sm">
          <span>{total} entrees - page {page + 1}/{Math.max(1, Math.ceil(total / limit))}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn btn-secondary text-xs"
            >
              <ChevronLeft size={14} /> Prec.
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * limit >= total}
              className="btn btn-secondary text-xs"
            >
              Suiv. <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
