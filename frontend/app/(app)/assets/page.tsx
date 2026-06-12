'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, AlertTriangle, Trash2, RefreshCw, ShieldCheck, ShieldAlert, Bell, BellOff, Search, Server } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, daysUntil } from '@/lib/utils';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableRowSkeleton } from '@/components/ui/Skeleton';
import { useReloadOnFocus } from '@/lib/useReloadOnFocus';
import { BarcodeScanButton } from '@/components/BarcodeScanButton';

const TYPE_LABEL: Record<string, string> = {
  HARDWARE: 'Materiel', LICENSE: 'Licence', SOFTWARE: 'Logiciel',
  DOMAIN: 'Domaine', CERTIFICATE: 'Certificat', M365_LICENSE: 'Licence M365', OTHER: 'Autre',
};
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Actif', INACTIVE: 'Inactif', EXPIRED: 'Expire', RETIRED: 'Retire',
};

export default function AssetsPage() {
  const [items, setItems] = useState<any[] | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [filterType, setFilterType] = useState('');
  const [filterExpiring, setFilterExpiring] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<any>({ type: 'HARDWARE', status: 'ACTIVE', monitoringEnabled: true });
  const confirm = useConfirm();

  async function load() {
    const params = new URLSearchParams();
    if (filterType) params.set('type', filterType);
    if (filterExpiring) params.set('expiringInDays', filterExpiring);
    const qs = params.toString();
    setItems(await api.get('/assets' + (qs ? '?' + qs : '')));
  }
  useEffect(() => {
    load();
    // Alimente le selecteur "Client" du formulaire. On surface une erreur
    // explicite au lieu de laisser le menu vide en silence (sinon "ca marche
    // pas" est indiagnostiquable). r.items defensif si la reponse change.
    api
      .get('/companies?pageSize=500')
      .then((r) => setCompanies(Array.isArray(r?.items) ? r.items : []))
      .catch((err) => toast.error('Chargement des societes echoue : ' + (err?.message ?? 'erreur')));
  }, [filterType, filterExpiring]);
  useReloadOnFocus(load);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/assets', { ...draft, costHt: draft.costHt ? Number(draft.costHt) : undefined });
      toast.success('Asset cree');
      setShowForm(false);
      setDraft({ type: 'HARDWARE', status: 'ACTIVE', monitoringEnabled: true });
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function remove(id: string, name: string) {
    const ok = await confirm({
      title: 'Supprimer cet asset ?',
      message: `« ${name} » sera definitivement retire du CRM. Cette action est irreversible.`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete('/assets/' + id);
      toast.success('Asset supprime');
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function toggleMonitoring(a: any) {
    try {
      await api.patch('/assets/' + a.id, { monitoringEnabled: !a.monitoringEnabled });
      toast.success(a.monitoringEnabled ? 'Surveillance desactivee' : 'Surveillance activee');
      load();
    } catch (err: any) { toast.error(err.message); }
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-bold">Assets clients</h1>
        <div className="flex gap-2">
          <BarcodeScanButton
            label="Scanner un asset"
            onScan={(text) => {
              // Filtre la liste sur l'identifiant scanne (numero de serie sur
              // l'etiquette du materiel typiquement). Recherche cote serveur
              // via le filtre identifier deja supporte par /assets.
              const params = new URLSearchParams();
              params.set('identifier', text);
              api.get('/assets?' + params.toString()).then((r) => {
                if (Array.isArray(r) && r.length > 0) {
                  // Redirige sur la fiche du 1er asset matchant
                  window.location.href = '/assets/' + r[0].id;
                } else {
                  toast.info('Aucun asset trouve avec l\'identifiant ' + text);
                }
              }).catch((err) => toast.error(err.message));
            }}
          />
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
            <Plus size={16} className="mr-1" /> Nouvel asset
          </button>
        </div>
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
          {(draft.type === 'CERTIFICATE' || draft.type === 'DOMAIN') && (
            <div className="flex items-start gap-2 rounded-md bg-mdo-50 dark:bg-slate-700 p-3">
              <input
                id="monitoringEnabled"
                type="checkbox"
                className="mt-0.5"
                checked={draft.monitoringEnabled !== false}
                onChange={(e) => set('monitoringEnabled', e.target.checked)}
              />
              <label htmlFor="monitoringEnabled" className="text-sm">
                <span className="font-medium">Surveillance automatique</span>
                <span className="block text-xs text-slate-500 dark:text-slate-300">
                  Verification quotidienne (TLS / WHOIS) et alerte (notif + email) a 30, 14, 7 et 1 jour(s) avant expiration. L'identifiant doit etre un FQDN (ex. <code>crm.mdoservices.fr</code>) pour un certificat, ou un domaine (ex. <code>mdoservices.fr</code>) pour un nom de domaine.
                </span>
              </label>
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Creer</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Annuler</button>
          </div>
        </form>
      )}

      <div className="card p-4 flex flex-wrap items-center gap-3">
        <select className="input max-w-xs" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">Tous types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input max-w-xs" value={filterExpiring} onChange={(e) => setFilterExpiring(e.target.value)}>
          <option value="">Toutes echeances</option>
          <option value="7">Expire dans 7 jours</option>
          <option value="30">Expire dans 30 jours</option>
          <option value="60">Expire dans 60 jours</option>
          <option value="90">Expire dans 90 jours</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-700 text-left text-xs uppercase tracking-wide text-slate-500">
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
            {items === null ? (
              Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} cols={7} />)
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="p-0">
                <EmptyState
                  icon={Server}
                  title="Aucun asset"
                  description={filterType || filterExpiring ? 'Aucun asset ne correspond aux filtres actifs.' : 'Commencez par ajouter un materiel, une licence ou un domaine a surveiller.'}
                  action={!filterType && !filterExpiring ? (
                    <button onClick={() => setShowForm(true)} className="btn btn-primary"><Plus size={16} className="mr-1" />Nouvel asset</button>
                  ) : undefined}
                />
              </td></tr>
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
                        <>
                          <button
                            onClick={() => toggleMonitoring(a)}
                            aria-label={a.monitoringEnabled ? `Desactiver la surveillance de ${a.name}` : `Activer la surveillance de ${a.name}`}
                            className={a.monitoringEnabled ? 'text-emerald-600 hover:text-emerald-700' : 'text-slate-400 hover:text-slate-600'}
                            title={a.monitoringEnabled ? 'Surveillance active - cliquer pour desactiver' : 'Surveillance desactivee - cliquer pour activer'}
                          >
                            {a.monitoringEnabled ? <Bell size={14} /> : <BellOff size={14} />}
                          </button>
                          <button onClick={() => checkMonitoring(a.id, a.name)} aria-label={`Verifier ${a.name} maintenant`} className="text-mdo-600 hover:text-mdo-700" title="Verifier maintenant (TLS / WHOIS)">
                            <RefreshCw size={14} />
                          </button>
                        </>
                      )}
                      {a.type === 'DOMAIN' && a.identifier && (
                        <Link
                          href={'/audit-dns?domain=' + encodeURIComponent(a.identifier)}
                          aria-label={`Audit DNS de ${a.identifier}`}
                          className="text-blue-600 hover:text-blue-700"
                          title="Audit DNS (MX / SPF / DMARC)"
                        >
                          <Search size={14} />
                        </Link>
                      )}
                      <button onClick={() => remove(a.id, a.name)} aria-label={`Supprimer ${a.name}`} className="text-red-500 hover:text-red-700" title="Supprimer"><Trash2 size={14} /></button>
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
