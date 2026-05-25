'use client';
import { useEffect, useState } from 'react';
import { Building2, Plus, RefreshCw, Download, Trash2, AlertTriangle, Globe, Users, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import { api, authedFetch } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatDateTime } from '@/lib/utils';

interface Tenant {
  id: string;
  slug: string;
  customDomain: string;
  isActive: boolean;
  brandName: string;
  brandShortName: string;
  brandPrimaryColor?: string | null;
  brandSupportEmail?: string | null;
  enableContracts: boolean;
  enableInvoices: boolean;
  enableOpportunities: boolean;
  enableQuotes: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { users: number; portalUsers: number };
}

interface CreateForm {
  slug: string;
  customDomain: string;
  brandName: string;
  brandShortName: string;
  brandTagline: string;
  brandPrimaryColor: string;
  brandSupportEmail: string;
}

const EMPTY_CREATE: CreateForm = {
  slug: '',
  customDomain: '',
  brandName: '',
  brandShortName: '',
  brandTagline: '',
  brandPrimaryColor: '#1d4ed8',
  brandSupportEmail: '',
};

export default function TenantsAdminPage() {
  const [items, setItems] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE);
  const [purging, setPurging] = useState<Tenant | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [purgeInProgress, setPurgeInProgress] = useState(false);
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    try {
      const list = await api.get('/tenants');
      setItems(list);
    } catch (err: any) {
      toast.error('Liste tenants indisponible : ' + (err.message ?? 'erreur'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function setF<K extends keyof CreateForm>(k: K, v: CreateForm[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function submitCreate() {
    // Validation basique cote client (le backend valide aussi le slug regex).
    if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(form.slug)) {
      toast.error('Slug invalide (a-z, 0-9, -, 2 a 31 caracteres)');
      return;
    }
    if (!form.customDomain || !form.brandName || !form.brandShortName) {
      toast.error('Domaine, nom et nom court requis');
      return;
    }
    setCreating(true);
    try {
      const payload: any = {
        slug: form.slug,
        customDomain: form.customDomain.trim(),
        brandName: form.brandName,
        brandShortName: form.brandShortName,
      };
      if (form.brandTagline) payload.brandTagline = form.brandTagline;
      if (form.brandPrimaryColor) payload.brandPrimaryColor = form.brandPrimaryColor;
      if (form.brandSupportEmail) payload.brandSupportEmail = form.brandSupportEmail;
      await api.post('/tenants', payload);
      toast.success('Tenant cree. Caddy reload en cours pour le nouveau domaine.');
      setShowCreate(false);
      setForm(EMPTY_CREATE);
      load();
    } catch (err: any) {
      toast.error('Creation echouee : ' + err.message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(t: Tenant) {
    const ok = await confirm({
      title: (t.isActive ? 'Desactiver' : 'Reactiver') + ' le tenant ' + t.slug + ' ?',
      message: t.isActive
        ? 'Toutes les requetes vers ' + t.customDomain + ' retourneront 503. Les donnees sont conservees.'
        : 'Le tenant redevient accessible via ' + t.customDomain + '.',
      confirmLabel: t.isActive ? 'Desactiver' : 'Reactiver',
      tone: t.isActive ? 'danger' : 'info',
    });
    if (!ok) return;
    try {
      await api.patch('/tenants/' + t.id, { isActive: !t.isActive });
      toast.success(t.isActive ? 'Desactive' : 'Reactive');
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function downloadExport(t: Tenant) {
    // Export RGPD : JSON complet du tenant. authedFetch envoie cookie + bearer.
    authedFetch('/api/tenants/' + t.id + '/export')
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tenant-' + t.slug + '-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Export ' + t.slug + ' telecharge');
      })
      .catch((err) => toast.error('Export echoue : ' + err.message));
  }

  async function performPurge() {
    if (!purging) return;
    if (purgeConfirm !== purging.slug) {
      toast.error('Slug de confirmation incorrect');
      return;
    }
    setPurgeInProgress(true);
    try {
      const r = await api.post('/tenants/' + purging.id + '/purge', { confirmSlug: purgeConfirm });
      toast.success('Tenant ' + purging.slug + ' purge. Entites supprimees : ' + Object.keys(r.deleted ?? {}).length);
      setPurging(null);
      setPurgeConfirm('');
      load();
    } catch (err: any) {
      toast.error('Purge echouee : ' + err.message);
    } finally {
      setPurgeInProgress(false);
    }
  }

  async function regenerateCaddy() {
    try {
      await api.post('/tenants/regenerate-caddy', {});
      toast.success('Caddy regenere');
    } catch (err: any) {
      toast.error('Regen Caddy echouee : ' + err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Building2 size={28} className="text-mdo-600" /> Tenants
        </h1>
        <div className="flex gap-2">
          <button onClick={regenerateCaddy} className="btn btn-secondary">
            <RefreshCw size={14} className="mr-1" /> Regenerer Caddy
          </button>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary">
            <Plus size={14} className="mr-1" /> Nouveau tenant
          </button>
        </div>
      </div>

      <div className="card p-4 bg-amber-50 border-amber-200 text-sm">
        <p className="text-amber-800 font-semibold flex items-center gap-2">
          <AlertTriangle size={14} /> Super-admin only
        </p>
        <p className="text-amber-700 mt-1 text-xs">
          Ces operations affectent l'ensemble du SaaS. La purge est IRREVERSIBLE — exporter avant.
          Caddy reload est automatique a chaque create/update/remove (besoin du sidecar caddy-provisioner actif).
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Slug</th>
              <th className="p-3 font-medium">Domaine</th>
              <th className="p-3 font-medium">Marque</th>
              <th className="p-3 font-medium text-center">Users</th>
              <th className="p-3 font-medium text-center">Portal</th>
              <th className="p-3 font-medium">Modules</th>
              <th className="p-3 font-medium">Statut</th>
              <th className="p-3 font-medium">Cree le</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="p-6 text-center text-slate-400">Chargement...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-slate-400">Aucun tenant.</td></tr>
            ) : items.map((t) => (
              <tr key={t.id} className="border-t hover:bg-slate-50">
                <td className="p-3 font-mono text-xs">{t.slug}</td>
                <td className="p-3 text-xs flex items-center gap-1">
                  <Globe size={12} className="text-slate-400" /> {t.customDomain}
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {t.brandPrimaryColor && (
                      <span className="inline-block w-3 h-3 rounded" style={{ background: t.brandPrimaryColor }} />
                    )}
                    <span className="font-medium">{t.brandName}</span>
                    <span className="text-xs text-slate-400">({t.brandShortName})</span>
                  </div>
                </td>
                <td className="p-3 text-center">
                  <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                    <Users size={12} /> {t._count?.users ?? '-'}
                  </span>
                </td>
                <td className="p-3 text-center text-xs">{t._count?.portalUsers ?? '-'}</td>
                <td className="p-3 text-[10px]">
                  <div className="flex flex-wrap gap-1">
                    {t.enableContracts && <span className="badge bg-slate-100 text-slate-700">Contracts</span>}
                    {t.enableInvoices && <span className="badge bg-slate-100 text-slate-700">Invoices</span>}
                    {t.enableQuotes && <span className="badge bg-slate-100 text-slate-700">Quotes</span>}
                    {t.enableOpportunities && <span className="badge bg-slate-100 text-slate-700">Opps</span>}
                  </div>
                </td>
                <td className="p-3">
                  {t.isActive ? (
                    <span className="badge bg-emerald-100 text-emerald-700">Actif</span>
                  ) : (
                    <span className="badge bg-red-100 text-red-700">Inactif (503)</span>
                  )}
                </td>
                <td className="p-3 text-xs">{formatDateTime(t.createdAt)}</td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => toggleActive(t)}
                    title={t.isActive ? 'Desactiver' : 'Reactiver'}
                    className={(t.isActive ? 'text-amber-600 hover:text-amber-800' : 'text-emerald-600 hover:text-emerald-800') + ' mr-2'}
                  >
                    {t.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                  </button>
                  <button onClick={() => downloadExport(t)} title="Exporter RGPD (JSON)" className="text-slate-500 hover:text-mdo-600 mr-2">
                    <Download size={14} />
                  </button>
                  {t.slug !== 'mdo' && (
                    <button onClick={() => setPurging(t)} title="Purger (RGPD art.17)" className="text-red-500 hover:text-red-700">
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal create */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Plus size={20} /> Nouveau tenant
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Slug (immuable, urls/logs)</label>
                <input className="input font-mono" value={form.slug}
                  onChange={(e) => setF('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="seysses" />
                <p className="text-[10px] text-slate-400 mt-1">a-z, 0-9, tirets. 2-31 char.</p>
              </div>
              <div>
                <label className="label">Domaine custom (FQDN)</label>
                <input className="input" value={form.customDomain}
                  onChange={(e) => setF('customDomain', e.target.value)}
                  placeholder="crm.mairie-seysses.fr" />
                <p className="text-[10px] text-slate-400 mt-1">DNS A record pointant vers ce serveur requis.</p>
              </div>
              <div>
                <label className="label">Nom de marque</label>
                <input className="input" value={form.brandName}
                  onChange={(e) => setF('brandName', e.target.value)}
                  placeholder="Mairie de Seysses" />
              </div>
              <div>
                <label className="label">Nom court</label>
                <input className="input" value={form.brandShortName}
                  onChange={(e) => setF('brandShortName', e.target.value)}
                  placeholder="Seysses" />
              </div>
              <div className="col-span-2">
                <label className="label">Tagline (optionnel)</label>
                <input className="input" value={form.brandTagline}
                  onChange={(e) => setF('brandTagline', e.target.value)}
                  placeholder="DSI — Services internes" />
              </div>
              <div>
                <label className="label">Couleur primaire</label>
                <input type="color" className="input h-10" value={form.brandPrimaryColor}
                  onChange={(e) => setF('brandPrimaryColor', e.target.value)} />
              </div>
              <div>
                <label className="label">Email support</label>
                <input type="email" className="input" value={form.brandSupportEmail}
                  onChange={(e) => setF('brandSupportEmail', e.target.value)}
                  placeholder="support@mairie-seysses.fr" />
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-700">
              Apres creation : (1) Caddy provisionne le domaine + ACME Let's Encrypt automatique.
              (2) Les settings par defaut sont seedes pour ce tenant. (3) Il reste a creer le 1er
              ADMIN du tenant via <code>npm run seed:admin</code> ou un endpoint dedie.
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowCreate(false); setForm(EMPTY_CREATE); }} className="btn btn-secondary" disabled={creating}>
                Annuler
              </button>
              <button onClick={submitCreate} disabled={creating} className="btn btn-primary">
                {creating ? 'Creation...' : 'Creer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal purge */}
      {purging && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle size={24} />
              <h2 className="text-xl font-bold">Purge RGPD du tenant {purging.slug}</h2>
            </div>
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm space-y-1">
              <p><strong>Domaine :</strong> {purging.customDomain}</p>
              <p><strong>Users :</strong> {purging._count?.users ?? '-'}</p>
              <p><strong>Portal users :</strong> {purging._count?.portalUsers ?? '-'}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
              <p className="font-semibold text-amber-800">Article 17 RGPD — IRREVERSIBLE</p>
              <ul className="list-disc list-inside text-amber-700 text-xs mt-1 space-y-0.5">
                <li>Toutes les donnees (companies, tickets, contracts, factures, etc.) seront supprimees</li>
                <li>Les users du tenant seront supprimes</li>
                <li>Les attachments physiques restent sur disque (a nettoyer separement)</li>
                <li>Telechargez le <strong>JSON export</strong> avant si le client veut son dump RGPD</li>
                <li>Caddy retire le site automatiquement apres la purge</li>
              </ul>
            </div>
            <div>
              <label className="label">
                Tapez exactement le slug pour confirmer : <code className="bg-slate-100 px-1 rounded">{purging.slug}</code>
              </label>
              <input className="input font-mono" value={purgeConfirm}
                onChange={(e) => setPurgeConfirm(e.target.value)}
                placeholder={purging.slug} />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setPurging(null); setPurgeConfirm(''); }} className="btn btn-secondary" disabled={purgeInProgress}>
                Annuler
              </button>
              <button
                onClick={performPurge}
                disabled={purgeInProgress || purgeConfirm !== purging.slug}
                className="btn btn-danger"
              >
                {purgeInProgress ? 'Purge en cours...' : 'Purger definitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
