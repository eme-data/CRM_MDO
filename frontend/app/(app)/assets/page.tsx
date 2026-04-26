'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, AlertTriangle, Trash2, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatEuro, daysUntil } from '@/lib/utils';

const TYPE_LABEL: Record<string, string> = {
  HARDWARE: 'Materiel', LICENSE: 'Licence', SOFTWARE: 'Logiciel',
  DOMAIN: 'Domaine', CERTIFICATE: 'Certificat', M365_LICENSE: 'Licence M365', OTHER: 'Autre',
};
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Actif', INACTIVE: 'Inactif', EXPIRED: 'Expire', RETIRED: 'Retire',
};

export default function AssetsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [filterType, setFilterType] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<any>({ type: 'HARDWARE', status: 'ACTIVE' });

  async function load() {
    const p = filterType ? '?type=' + filterType : '';
    setItems(await api.get('/assets' + p));
  }
  useEffect(() => {
    load();
    api.get('/companies?pageSize=500').then((r) => setCompanies(r.items));
  }, [filterType]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/assets', { ...draft, costHt: draft.costHt ? Number(draft.costHt) : undefined });
      toast.success('Asset cree');
      setShowForm(false);
      setDraft({ type: 'HARDWARE', status: 'ACTIVE' });
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cet asset ?')) return;
    await api.delete('/assets/' + id);
    load();
  }

  async function checkMonitoring(id: string, name: string) {
    const t = toast.loading('Verification de ' + name + '...');
    try {
      const r = await api.post('/monitoring/assets/' + id + '/check');
      toast.dismiss(t);
      if (r.ok) {
        toast.success('Verifie : ' + (r.daysRemaining !== undefined ? r.daysRemaining + ' jour(s) restants' : 'OK'));
      } else {
        toast.error('Echec : ' + (r.error ?? 'erreur inconnue'));
      }
      load();
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err.message);
    }
  }

  function set(k: string, v: any) { setDraft((d: any) => ({ ...d, [k]: v })); }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Assets clients</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
          <Plus size={16} className="mr-1" /> Nouvel asset
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card p-6 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><label className="label">Nom *</label><input className="input" required onChange={(e) => set('name', e.target.value)} /></div>
            <div><label className="label">Type</label>
              <select className="input" value={draft.type} onChange={(e) => set('type', e.target.value)}>
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label className="label">Client *</label>
              <select className="input" required onChange={(e) => set('companyId', e.target.value)}>
                <option value="">--</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="label">Identifiant (SN, FQDN, cle...)</label><input className="input" onChange={(e) => set('identifier', e.target.value)} /></div>
            <div><label className="label">Vendeur</label><input className="input" onChange={(e) => set('vendor', e.target.value)} /></div>
            <div><label className="label">Modele</label><input className="input" onChange={(e) => set('model', e.target.value)} /></div>
            <div><label className="label">Acquis le</label><input type="date" className="input" onChange={(e) => set('acquiredAt', e.target.value)} /></div>
            <div><label className="label">Garantie jusqu'au</label><input type="date" className="input" onChange={(e) => set('warrantyUntil', e.target.value)} /></div>
            <div><label className="label">Expire le</label><input type="date" className="input" onChange={(e) => set('expiresAt', e.target.value)} /></div>
            <div><label className="label">Cout HT</label><input type="number" step="0.01" className="input" onChange={(e) => set('costHt', e.target.value)} /></div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Creer</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Annuler</button>
          </div>
        </form>
      )}

      <div className="card p-4">
        <select className="input max-w-xs" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">Tous types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-700 text-left">
            <tr>
              <th className="p-3 font-medium">Nom</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">Identifiant</th>
              <th className="p-3 font-medium">Expire</th>
              <th className="p-3 font-medium">Statut</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-slate-400">Aucun asset</td></tr>
            ) : items.map((a) => {
              const days = a.expiresAt ? daysUntil(a.expiresAt) : null;
              const expSoon = days !== null && days >= 0 && days <= 30;
              const expired = days !== null && days < 0;
              const monitorable = (a.type === 'CERTIFICATE' || a.type === 'DOMAIN') && a.identifier;
              return (
                <tr key={a.id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="p-3 font-medium">{a.name}</td>
                  <td className="p-3">{TYPE_LABEL[a.type]}</td>
                  <td className="p-3"><Link href={'/companies/' + a.company.id} className="text-mdo-600 hover:underline">{a.company.name}</Link></td>
                  <td className="p-3 font-mono text-xs">{a.identifier ?? '-'}</td>
                  <td className="p-3">
                    {a.expiresAt ? (
                      <div className="flex flex-col gap-0.5">
                        <span className={'inline-flex items-center gap-1 ' + (expired ? 'text-red-600 font-medium' : expSoon ? 'text-amber-600 font-medium' : '')}>
                          {expired ? <ShieldAlert size={14} /> : expSoon ? <AlertTriangle size={14} /> : <ShieldCheck size={14} className="text-emerald-600" />}
                          {formatDate(a.expiresAt)}
                        </span>
                        {days !== null && (
                          <span className="text-xs text-slate-400">
                            {expired ? 'expire depuis ' + Math.abs(days) + ' j' : 'dans ' + days + ' j'}
                          </span>
                        )}
                        {a.lastMonitoredAt && (
                          <span className="text-xs text-slate-400">verifie {formatDate(a.lastMonitoredAt)}</span>
                        )}
                        {a.monitoringError && (
                          <span className="text-xs text-red-500" title={a.monitoringError}>echec dernier check</span>
                        )}
                      </div>
                    ) : '-'}
                  </td>
                  <td className="p-3"><span className="badge bg-slate-100 text-slate-700">{STATUS_LABEL[a.status]}</span></td>
                  <td className="p-3">
                    <div className="flex gap-2 items-center">
                      {monitorable && (
                        <button onClick={() => checkMonitoring(a.id, a.name)} className="text-mdo-600 hover:text-mdo-700" title="Verifier maintenant (TLS / WHOIS)">
                          <RefreshCw size={14} />
                        </button>
                      )}
                      <button onClick={() => remove(a.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
