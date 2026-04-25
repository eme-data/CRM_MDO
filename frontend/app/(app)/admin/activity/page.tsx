'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
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

  useEffect(() => {
    api.get('/users').then(setUsers).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [filters, page]);

  function set(k: string, v: string) {
    setPage(0);
    setFilters((f) => ({ ...f, [k]: v }));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Journal d'activite</h1>

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
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Utilisateur</th>
              <th className="p-3 font-medium">Action</th>
              <th className="p-3 font-medium">Entite</th>
              <th className="p-3 font-medium">Cible</th>
              <th className="p-3 font-medium">Metadonnees</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-slate-400">Chargement...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-slate-400">Aucune entree</td></tr>
            ) : items.map((a) => (
              <tr key={a.id} className="border-t">
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
