'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Globe, Plus, Edit, Trash2, Power, PowerOff, Users, Building2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmDialog';

interface TenantRow {
  id: string;
  slug: string;
  customDomain: string;
  isActive: boolean;
  brandName: string;
  brandShortName: string;
  brandTagline: string | null;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  brandSupportEmail: string | null;
  brandDpoEmail: string | null;
  brandWebsiteUrl: string | null;
  brandFooterText: string | null;
  enableContracts: boolean;
  enableInvoices: boolean;
  enableOpportunities: boolean;
  enableQuotes: boolean;
  createdAt: string;
  _count: { users: number; portalUsers: number };
}

export default function SuperAdminTenantsPage() {
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TenantRow | null>(null);
  const confirm = useConfirm();

  async function load() {
    try {
      setTenants(await api.get('/tenants'));
    } catch (err: any) {
      if (err.status === 403) {
        setTenants([]);
        toast.error('Acces reserve au super-administrateur.');
      } else {
        toast.error('Chargement tenants : ' + err.message);
      }
    }
  }

  useEffect(() => { load(); }, []);

  async function toggleActive(t: TenantRow) {
    try {
      await api.patch('/tenants/' + t.id, { isActive: !t.isActive });
      toast.success(t.isActive ? 'Tenant suspendu' : 'Tenant reactive');
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function handleDelete(t: TenantRow) {
    const ok = await confirm({
      title: 'Supprimer ce tenant ?',
      message: `Le tenant "${t.brandName}" (${t.slug}) sera definitivement supprime. Toutes ses donnees (Companies, Tickets, Contrats, Factures...) seront ORPHELINES. Cette action est irreversible.`,
      confirmLabel: 'Supprimer definitivement',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete('/tenants/' + t.id);
      toast.success('Tenant supprime');
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  if (!tenants) return <div>Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Globe className="text-mdo-500" /> Tenants
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Pilotage SaaS multi-tenant. 1 tenant = 1 client (instance avec son domaine, son branding, ses settings).
          </p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(!showForm); }} className="btn btn-primary">
          <Plus size={16} className="mr-1" /> Nouveau tenant
        </button>
      </div>

      <div className="card p-4 bg-amber-50 border-amber-200 text-sm text-amber-900 flex items-start gap-2">
        <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <div>
          <strong>Avant de creer un tenant :</strong> verifier que le DNS du domaine pointe deja sur ce serveur (Caddy doit pouvoir obtenir un certificat HTTPS), sinon le tenant sera inaccessible. Apres creation, l'admin du tenant doit configurer ses settings (SMTP, IMAP, cles API IA) — les credentials MDO ne sont PAS heritees.
        </div>
      </div>

      {showForm && (
        <TenantForm
          tenant={editing ?? undefined}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {tenants.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">
          Aucun tenant. Le tenant "mdo" est cree automatiquement au boot — s'il n'apparait pas, redemarrer le backend.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700 text-left">
              <tr>
                <th className="p-3 font-medium">Slug</th>
                <th className="p-3 font-medium">Marque</th>
                <th className="p-3 font-medium">Domaine</th>
                <th className="p-3 font-medium">Modules</th>
                <th className="p-3 font-medium">Users</th>
                <th className="p-3 font-medium">Statut</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="p-3 font-mono text-xs">{t.slug}</td>
                  <td className="p-3">
                    <div className="font-medium">{t.brandName}</div>
                    {t.brandTagline && <div className="text-xs text-slate-500">{t.brandTagline}</div>}
                  </td>
                  <td className="p-3 font-mono text-xs">
                    <a href={'https://' + t.customDomain} target="_blank" rel="noopener noreferrer" className="text-mdo-600 hover:underline">
                      {t.customDomain}
                    </a>
                  </td>
                  <td className="p-3 text-xs">
                    <div className="flex flex-wrap gap-1">
                      {t.enableContracts && <span className="badge bg-blue-100 text-blue-700">Contrats</span>}
                      {t.enableInvoices && <span className="badge bg-emerald-100 text-emerald-700">Factures</span>}
                      {t.enableOpportunities && <span className="badge bg-purple-100 text-purple-700">Opps</span>}
                      {t.enableQuotes && <span className="badge bg-amber-100 text-amber-700">Devis</span>}
                    </div>
                  </td>
                  <td className="p-3 text-xs">
                    <div className="flex items-center gap-2 text-slate-600">
                      <Users size={12} /> {t._count.users}
                      <Building2 size={12} className="ml-1" /> {t._count.portalUsers}
                    </div>
                  </td>
                  <td className="p-3">
                    {t.isActive ? (
                      <span className="badge bg-emerald-100 text-emerald-700">Actif</span>
                    ) : (
                      <span className="badge bg-red-100 text-red-700">Suspendu</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() => { setEditing(t); setShowForm(true); }}
                        className="text-mdo-600 hover:text-mdo-700"
                        title="Editer"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        onClick={() => toggleActive(t)}
                        className={t.isActive ? 'text-emerald-600' : 'text-slate-400'}
                        title={t.isActive ? 'Suspendre (les requetes sur ce domaine retourneront 503)' : 'Reactiver'}
                      >
                        {t.isActive ? <Power size={14} /> : <PowerOff size={14} />}
                      </button>
                      {t.slug !== 'mdo' && (
                        <button
                          onClick={() => handleDelete(t)}
                          className="text-red-500 hover:text-red-700"
                          title="Supprimer (impossible si users existent)"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TenantForm({
  tenant, onSaved, onCancel,
}: {
  tenant?: TenantRow;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [data, setData] = useState({
    slug: tenant?.slug ?? '',
    customDomain: tenant?.customDomain ?? '',
    brandName: tenant?.brandName ?? '',
    brandShortName: tenant?.brandShortName ?? '',
    brandTagline: tenant?.brandTagline ?? '',
    brandLogoUrl: tenant?.brandLogoUrl ?? '/logo.png',
    brandPrimaryColor: tenant?.brandPrimaryColor ?? '#1d4ed8',
    brandSupportEmail: tenant?.brandSupportEmail ?? '',
    brandDpoEmail: tenant?.brandDpoEmail ?? '',
    brandWebsiteUrl: tenant?.brandWebsiteUrl ?? '',
    brandFooterText: tenant?.brandFooterText ?? '',
    enableContracts: tenant?.enableContracts ?? true,
    enableInvoices: tenant?.enableInvoices ?? true,
    enableOpportunities: tenant?.enableOpportunities ?? true,
    enableQuotes: tenant?.enableQuotes ?? true,
  });
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // Whitelist : on n'envoie que les champs editables, pas l'id ni _count.
      const payload: Record<string, any> = {};
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'string' && v.trim() === '') continue;
        payload[k] = v;
      }
      // slug n'est pas modifiable apres creation (il est utilise dans les
      // logs et l'identification interne — changer = drame).
      if (tenant) delete payload.slug;
      if (tenant) {
        await api.patch('/tenants/' + tenant.id, payload);
        toast.success('Tenant mis a jour');
      } else {
        await api.post('/tenants', payload);
        toast.success('Tenant cree — l\'admin doit maintenant configurer ses settings');
      }
      onSaved();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-6 space-y-4 border-mdo-200 bg-mdo-50/30">
      <h3 className="font-semibold">{tenant ? 'Modifier le tenant' : 'Nouveau tenant'}</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="label">Slug * <span className="text-xs text-slate-500">(stable, [a-z0-9-], ex: "seysses")</span></label>
          <input
            className="input font-mono"
            required
            disabled={!!tenant}
            pattern="[a-z0-9][a-z0-9-]{1,30}"
            value={data.slug}
            onChange={(e) => setData({ ...data, slug: e.target.value })}
            placeholder="seysses"
          />
        </div>
        <div>
          <label className="label">Domaine custom *</label>
          <input
            className="input font-mono"
            required
            type="text"
            value={data.customDomain}
            onChange={(e) => setData({ ...data, customDomain: e.target.value })}
            placeholder="crm.mairie-seysses.fr"
          />
        </div>
        <div>
          <label className="label">Nom complet *</label>
          <input
            className="input"
            required
            value={data.brandName}
            onChange={(e) => setData({ ...data, brandName: e.target.value })}
            placeholder="Mairie de SEYSSES"
          />
        </div>
        <div>
          <label className="label">Nom court *</label>
          <input
            className="input"
            required
            value={data.brandShortName}
            onChange={(e) => setData({ ...data, brandShortName: e.target.value })}
            placeholder="Seysses"
          />
        </div>
        <div className="md:col-span-2">
          <label className="label">Tagline / accroche</label>
          <input
            className="input"
            value={data.brandTagline}
            onChange={(e) => setData({ ...data, brandTagline: e.target.value })}
            placeholder="Service Informatique Mutualise"
          />
        </div>
        <div>
          <label className="label">URL logo</label>
          <input
            className="input"
            value={data.brandLogoUrl}
            onChange={(e) => setData({ ...data, brandLogoUrl: e.target.value })}
            placeholder="/logo-seysses.png"
          />
        </div>
        <div>
          <label className="label">Couleur primaire (HEX)</label>
          <div className="flex gap-2">
            <input
              type="color"
              className="h-10 w-14 border border-slate-300 rounded"
              value={data.brandPrimaryColor}
              onChange={(e) => setData({ ...data, brandPrimaryColor: e.target.value })}
            />
            <input
              className="input flex-1 font-mono"
              value={data.brandPrimaryColor}
              onChange={(e) => setData({ ...data, brandPrimaryColor: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="label">Email support</label>
          <input
            className="input"
            type="email"
            value={data.brandSupportEmail}
            onChange={(e) => setData({ ...data, brandSupportEmail: e.target.value })}
            placeholder="support@mairie-seysses.fr"
          />
        </div>
        <div>
          <label className="label">Email DPO RGPD</label>
          <input
            className="input"
            type="email"
            value={data.brandDpoEmail}
            onChange={(e) => setData({ ...data, brandDpoEmail: e.target.value })}
            placeholder="dpo@mairie-seysses.fr"
          />
        </div>
        <div>
          <label className="label">Site web</label>
          <input
            className="input"
            value={data.brandWebsiteUrl}
            onChange={(e) => setData({ ...data, brandWebsiteUrl: e.target.value })}
            placeholder="https://www.mairie-seysses.fr"
          />
        </div>
        <div className="md:col-span-2">
          <label className="label">Texte du footer portail</label>
          <input
            className="input"
            value={data.brandFooterText}
            onChange={(e) => setData({ ...data, brandFooterText: e.target.value })}
            placeholder="Mairie de SEYSSES - Service Informatique"
          />
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-2">Modules actives</h4>
        <p className="text-xs text-slate-500 mb-2">Decocher pour cacher les sections correspondantes (utile pour une DSI publique sans facturation).</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { key: 'enableContracts' as const, label: 'Contrats' },
            { key: 'enableInvoices' as const, label: 'Factures' },
            { key: 'enableOpportunities' as const, label: 'Opportunites' },
            { key: 'enableQuotes' as const, label: 'Devis' },
          ].map((m) => (
            <label key={m.key} className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={data[m.key]}
                onChange={(e) => setData({ ...data, [m.key]: e.target.checked })}
              />
              {m.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="btn btn-primary">
          {loading ? 'Enregistrement...' : (tenant ? 'Mettre a jour' : 'Creer le tenant')}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-secondary">Annuler</button>
      </div>
    </form>
  );
}
