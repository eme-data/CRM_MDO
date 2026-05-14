'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Cloud,
  Link2,
  RefreshCw,
  Unlink,
  CheckCircle2,
  AlertTriangle,
  Users,
  Award,
  Shield,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useConfirm } from '@/components/ui/ConfirmDialog';

interface Tenant {
  id: string;
  tenantId: string;
  tenantDomain: string | null;
  consentedAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  isActive: boolean;
  // Microsoft Secure Score (cf M365Tenant fields).
  // null = non disponible (tenant sans licence eligible ou permission manquante).
  secureScore: number | null;
  secureScoreMax: number | null;
  secureScorePercent: number | null;
  secureScoreSyncedAt: string | null;
  _count: { users: number; licenses: number; alerts: number };
}

interface M365User {
  id: string;
  upn: string;
  displayName: string | null;
  jobTitle: string | null;
  department: string | null;
  accountEnabled: boolean;
  mfaEnabled: boolean | null;
  lastSignInAt: string | null;
  licenseSkus: string[];
}

interface M365License {
  id: string;
  skuPartNumber: string;
  name: string | null;
  totalUnits: number;
  consumedUnits: number;
}

interface M365Alert {
  id: string;
  alertId: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  category: string | null;
  createdDateTime: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-blue-100 text-blue-700',
  informational: 'bg-slate-100 text-slate-700',
};

export function M365Section({ companyId }: { companyId: string }) {
  const [tenant, setTenant] = useState<Tenant | null | undefined>(undefined);
  const [users, setUsers] = useState<M365User[]>([]);
  const [licenses, setLicenses] = useState<M365License[]>([]);
  const [alerts, setAlerts] = useState<M365Alert[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<'overview' | 'users' | 'licenses' | 'alerts'>('overview');
  const confirm = useConfirm();

  async function load() {
    try {
      const t = await api.get(`/m365/companies/${companyId}`);
      setTenant(t);
      if (t) {
        const [u, l, a] = await Promise.all([
          api.get(`/m365/companies/${companyId}/users`),
          api.get(`/m365/companies/${companyId}/licenses`),
          api.get(`/m365/companies/${companyId}/alerts`),
        ]);
        setUsers(u);
        setLicenses(l);
        setAlerts(a);
      }
    } catch {
      setTenant(null);
    }
  }
  useEffect(() => { load(); }, [companyId]);

  async function connect() {
    try {
      const { url } = await api.get(`/m365/companies/${companyId}/consent-url`);
      // Ouvre l'admin consent dans une nouvelle fenetre, l'admin client s'authentifie
      // et donne consent. Notre callback redirige ensuite vers la fiche societe.
      window.open(url, '_blank', 'width=600,height=700');
      toast.info('La fenetre Microsoft s\'est ouverte. Demandez a votre client de cliquer "Accepter" pour autoriser MDO Services.');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function sync() {
    setSyncing(true);
    const t = toast.loading('Synchronisation en cours...');
    try {
      const r = await api.post(`/m365/companies/${companyId}/sync`);
      toast.dismiss(t);
      toast.success(`Synchronise : ${r.usersCount} users, ${r.licCount} licences, ${r.alertsCount} alertes`);
      load();
    } catch (err: any) {
      toast.dismiss(t);
      toast.error('Echec sync : ' + err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    const ok = await confirm({
      title: 'Deconnecter ce tenant M365 ?',
      message: 'Toutes les donnees synchronisees (utilisateurs, licences, alertes) seront supprimees du CRM. Le client conservera ses donnees dans Microsoft 365, mais devra reaccorder le consent pour reconnecter.',
      confirmLabel: 'Deconnecter',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/m365/companies/${companyId}`);
      toast.success('Tenant deconnecte');
      setTenant(null);
      setUsers([]); setLicenses([]); setAlerts([]);
    } catch (err: any) { toast.error(err.message); }
  }

  if (tenant === undefined) {
    return (
      <div className="card p-6">
        <div className="h-5 w-40 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="card p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Cloud size={18} className="text-blue-500" />
              Microsoft 365
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Synchronisez les utilisateurs, licences et alertes de securite du tenant M365 du client.
            </p>
          </div>
          <button onClick={connect} className="btn btn-primary">
            <Link2 size={14} className="mr-1" /> Connecter M365
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Le client recevra une page de consentement Microsoft. Il devra etre admin de son tenant pour autoriser.
        </p>
      </div>
    );
  }

  const statusBadge = tenant.lastSyncStatus === 'OK'
    ? { label: 'OK', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 }
    : tenant.lastSyncStatus === 'PARTIAL'
      ? { label: 'Partiel', cls: 'bg-amber-100 text-amber-700', icon: AlertTriangle }
      : tenant.lastSyncStatus === 'FAILED'
        ? { label: 'Echec', cls: 'bg-red-100 text-red-700', icon: AlertTriangle }
        : { label: 'Jamais', cls: 'bg-slate-100 text-slate-700', icon: AlertTriangle };
  const StatusIcon = statusBadge.icon;

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <Cloud size={18} className="text-blue-500" />
            Microsoft 365
            <span className={'badge text-xs ' + statusBadge.cls}>
              <StatusIcon size={10} className="inline mr-1" />
              {statusBadge.label}
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tenant <code className="font-mono">{tenant.tenantId}</code>
            {tenant.lastSyncAt && ` · dernier sync ${formatDateTime(tenant.lastSyncAt)}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={sync} disabled={syncing} className="btn btn-secondary text-sm py-1.5">
            <RefreshCw size={14} className={'mr-1 ' + (syncing ? 'animate-spin' : '')} />
            {syncing ? 'Sync...' : 'Synchroniser'}
          </button>
          <button onClick={disconnect} aria-label="Deconnecter M365" className="btn btn-danger text-sm py-1.5">
            <Unlink size={14} className="mr-1" /> Deconnecter
          </button>
        </div>
      </div>

      {tenant.lastSyncError && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-200">
          <strong>Avertissement :</strong> {tenant.lastSyncError}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Tile icon={Users} label="Utilisateurs" value={tenant._count.users} color="text-blue-500" />
        <Tile icon={Award} label="Licences" value={tenant._count.licenses} color="text-emerald-500" />
        <Tile icon={Shield} label="Alertes actives" value={alerts.length} color={alerts.length > 0 ? 'text-red-500' : 'text-slate-400'} />
      </div>

      <div className="border-b border-slate-200 dark:border-slate-700 flex gap-1 -mb-px">
        {[
          { v: 'overview', l: 'Vue d\'ensemble' },
          { v: 'users', l: `Utilisateurs (${users.length})` },
          { v: 'licenses', l: `Licences (${licenses.length})` },
          { v: 'alerts', l: `Alertes (${alerts.length})` },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v as any)}
            className={
              'px-3 py-2 text-sm border-b-2 transition-colors ' +
              (tab === t.v
                ? 'border-mdo-500 text-mdo-600 font-medium'
                : 'border-transparent text-slate-500 hover:text-slate-700')
            }
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab tenant={tenant} users={users} licenses={licenses} alerts={alerts} />}
      {tab === 'users' && <UsersTab users={users} />}
      {tab === 'licenses' && <LicensesTab licenses={licenses} />}
      {tab === 'alerts' && <AlertsTab alerts={alerts} />}
    </div>
  );
}

function Tile({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  return (
    <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-xl font-bold tabular-nums mt-0.5">{value}</p>
        </div>
        <Icon size={18} className={color} />
      </div>
    </div>
  );
}

function OverviewTab({ tenant, users, licenses, alerts }: { tenant: Tenant; users: M365User[]; licenses: M365License[]; alerts: M365Alert[] }) {
  const mfaTotal = users.filter((u) => u.mfaEnabled !== null).length;
  const mfaEnabled = users.filter((u) => u.mfaEnabled === true).length;
  const disabledUsers = users.filter((u) => !u.accountEnabled).length;
  const securePct = tenant.secureScorePercent;
  // Couleur du Secure Score : suit les memes paliers que le Cyber Score widget
  // pour coherence visuelle (>=85 vert, 70-84 bleu, 50-69 amber, <50 rouge).
  const secureColor =
    securePct === null ? 'text-slate-500' :
    securePct >= 85 ? 'text-emerald-700 dark:text-emerald-300' :
    securePct >= 70 ? 'text-blue-700 dark:text-blue-300' :
    securePct >= 50 ? 'text-amber-700 dark:text-amber-300' :
    'text-red-700 dark:text-red-300';
  return (
    <div className="space-y-3">
      {/* Microsoft Secure Score : carte prominente en haut si dispo */}
      {securePct !== null && tenant.secureScore !== null && tenant.secureScoreMax !== null && (
        <div className="rounded-md border-2 border-mdo-200 dark:border-mdo-800 bg-mdo-50 dark:bg-mdo-950/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Microsoft Secure Score</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className={'text-3xl font-bold tabular-nums ' + secureColor}>
                  {securePct.toFixed(1)}%
                </span>
                <span className="text-sm text-slate-500">
                  {tenant.secureScore.toFixed(0)} / {tenant.secureScoreMax.toFixed(0)} pts
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Indicateur officiel Microsoft · couvre MFA, conditional access, Defender, partage externe
                {tenant.secureScoreSyncedAt && (
                  <span> · sync {formatDateTime(tenant.secureScoreSyncedAt)}</span>
                )}
              </p>
            </div>
            <a
              href={'https://security.microsoft.com/securescore'}
              target="_blank"
              rel="noopener"
              className="btn btn-secondary text-xs"
              title="Voir le detail dans Microsoft Defender XDR"
            >
              Detail
            </a>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="rounded-md bg-slate-50 dark:bg-slate-700/50 p-3">
          <p className="text-xs text-slate-500">Couverture MFA</p>
          <p className="font-medium">
            {mfaTotal > 0
              ? `${mfaEnabled} / ${mfaTotal} (${Math.round((mfaEnabled / mfaTotal) * 100)} %)`
              : 'Donnees MFA non disponibles'}
          </p>
        </div>
        <div className="rounded-md bg-slate-50 dark:bg-slate-700/50 p-3">
          <p className="text-xs text-slate-500">Comptes desactives</p>
          <p className="font-medium">{disabledUsers}</p>
        </div>
        <div className="rounded-md bg-slate-50 dark:bg-slate-700/50 p-3">
          <p className="text-xs text-slate-500">Licences consommees</p>
          <p className="font-medium tabular-nums">
            {licenses.reduce((s, l) => s + l.consumedUnits, 0)} /{' '}
            {licenses.reduce((s, l) => s + l.totalUnits, 0)}
          </p>
        </div>
        <div className="rounded-md bg-slate-50 dark:bg-slate-700/50 p-3">
          <p className="text-xs text-slate-500">Alertes severes</p>
          <p className="font-medium">{alerts.filter((a) => a.severity === 'high').length}</p>
        </div>
      </div>

      {securePct === null && tenant.isActive && (
        <p className="text-xs text-slate-500 italic">
          Microsoft Secure Score non disponible pour ce tenant (necessite une licence E3/E5/Business Premium et la permission SecurityEvents.Read.All sur l'app multi-tenant MDO).
        </p>
      )}
    </div>
  );
}

function UsersTab({ users }: { users: M365User[] }) {
  if (users.length === 0) return <p className="text-sm text-slate-400">Aucun utilisateur synchronise.</p>;
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="p-2">Nom</th>
            <th className="p-2">UPN</th>
            <th className="p-2">Poste</th>
            <th className="p-2">Statut</th>
            <th className="p-2">MFA</th>
            <th className="p-2">Licences</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={'border-t border-slate-200 dark:border-slate-700 ' + (!u.accountEnabled ? 'opacity-50' : '')}>
              <td className="p-2 font-medium">{u.displayName ?? '-'}</td>
              <td className="p-2 font-mono text-xs text-slate-500">{u.upn}</td>
              <td className="p-2 text-xs">{u.jobTitle ?? '-'}</td>
              <td className="p-2">
                {u.accountEnabled
                  ? <span className="badge bg-emerald-100 text-emerald-700">Actif</span>
                  : <span className="badge bg-slate-100 text-slate-500">Desactive</span>}
              </td>
              <td className="p-2">
                {u.mfaEnabled === true
                  ? <span className="badge bg-emerald-100 text-emerald-700">Oui</span>
                  : u.mfaEnabled === false
                    ? <span className="badge bg-red-100 text-red-700">Non</span>
                    : <span className="text-slate-400">-</span>}
              </td>
              <td className="p-2 text-xs text-slate-500">
                {u.licenseSkus.length > 0 ? u.licenseSkus.slice(0, 3).join(', ') + (u.licenseSkus.length > 3 ? '...' : '') : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LicensesTab({ licenses }: { licenses: M365License[] }) {
  if (licenses.length === 0) return <p className="text-sm text-slate-400">Aucune licence synchronisee.</p>;
  return (
    <div className="space-y-2">
      {licenses.map((l) => {
        const pct = l.totalUnits > 0 ? (l.consumedUnits / l.totalUnits) * 100 : 0;
        return (
          <div key={l.id} className="rounded-md border border-slate-200 dark:border-slate-700 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{l.name ?? l.skuPartNumber}</span>
              <span className="text-sm text-slate-500 tabular-nums">
                {l.consumedUnits} / {l.totalUnits}
              </span>
            </div>
            <div className="mt-2 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={'h-full ' + (pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-amber-500' : 'bg-emerald-500')}
                style={{ width: Math.min(pct, 100) + '%' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AlertsTab({ alerts }: { alerts: M365Alert[] }) {
  if (alerts.length === 0) return <p className="text-sm text-slate-400">Aucune alerte de securite active.</p>;
  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div key={a.id} className="rounded-md border border-slate-200 dark:border-slate-700 p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-medium text-sm">{a.title}</span>
            <span className={'badge text-xs ' + (SEVERITY_COLOR[a.severity] ?? 'bg-slate-100 text-slate-700')}>
              {a.severity}
            </span>
          </div>
          {a.description && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{a.description}</p>
          )}
          <p className="text-xs text-slate-400 mt-2">
            {a.category ?? 'sans categorie'} · {formatDateTime(a.createdDateTime)} · statut {a.status}
          </p>
        </div>
      ))}
    </div>
  );
}
