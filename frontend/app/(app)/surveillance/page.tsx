'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  PlayCircle,
  Mail,
  Clock,
  Globe,
  Lock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';

interface OverviewItem {
  id: string;
  name: string;
  type: 'CERTIFICATE' | 'DOMAIN';
  identifier: string | null;
  expiresAt: string;
  daysRemaining: number;
  lastMonitoredAt: string | null;
  company: { id: string; name: string };
}

interface OverviewError {
  id: string;
  name: string;
  type: 'CERTIFICATE' | 'DOMAIN';
  identifier: string | null;
  monitoringError: string | null;
  lastMonitoredAt: string | null;
  company: { id: string; name: string };
}

interface Overview {
  counts: {
    tracked: number;
    untracked: number;
    withErrors: number;
    expired: number;
    in7: number;
    in30: number;
    in60: number;
    in90: number;
  };
  items: OverviewItem[];
  errors: OverviewError[];
}

function bucketColor(days: number) {
  if (days < 0) return 'text-red-600 bg-red-50 dark:bg-red-900/30';
  if (days <= 7) return 'text-red-600 bg-red-50 dark:bg-red-900/30';
  if (days <= 30) return 'text-amber-600 bg-amber-50 dark:bg-amber-900/30';
  if (days <= 60) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30';
  return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30';
}

function StatCard({
  label,
  value,
  sub,
  color = 'text-mdo-500',
  icon: Icon,
}: {
  label: string;
  value: number;
  sub?: string;
  color?: string;
  icon: any;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
        </div>
        <Icon size={32} className={color} />
      </div>
    </div>
  );
}

export default function SurveillancePage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    try {
      setData(await api.get('/monitoring/overview'));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function checkOne(id: string, name: string) {
    const t = toast.loading('Verification de ' + name + '...');
    try {
      const r = await api.post('/monitoring/assets/' + id + '/check');
      toast.dismiss(t);
      if (r.ok) toast.success('Verifie : ' + (r.daysRemaining !== undefined ? r.daysRemaining + ' jour(s) restants' : 'OK'));
      else toast.error('Echec : ' + (r.error ?? 'erreur inconnue'));
      load();
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err.message);
    }
  }

  async function runAll() {
    const ok = await confirm({
      title: 'Lancer une verification complete ?',
      message: 'Tous les certificats et domaines surveilles vont etre verifies immediatement (TLS + WHOIS). Cela peut prendre quelques minutes.',
      confirmLabel: 'Lancer',
      tone: 'info',
    });
    if (!ok) return;
    setRunning(true);
    const t = toast.loading('Verification globale en cours...');
    try {
      const r = await api.post('/monitoring/run-all');
      toast.dismiss(t);
      toast.success(r.checked + ' verifie(s) - ' + r.ok + ' OK / ' + r.ko + ' KO');
      load();
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function runDigest() {
    const ok = await confirm({
      title: 'Envoyer le recap hebdomadaire ?',
      message: 'Un email recapitulatif sera envoye immediatement a tous les destinataires configures.',
      confirmLabel: 'Envoyer',
      tone: 'info',
    });
    if (!ok) return;
    const t = toast.loading('Envoi du recap...');
    try {
      const r = await api.post('/monitoring/digest/run');
      toast.dismiss(t);
      toast.success('Recap envoye a ' + r.recipients + ' utilisateur(s)');
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err.message);
    }
  }

  if (!data) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <Skeleton className="h-64" />
    </div>
  );

  const c = data.counts;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="text-mdo-500" /> Surveillance
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Certificats SSL et domaines surveilles automatiquement (check quotidien a 5h, recap hebdo le lundi 8h).
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn btn-secondary" disabled={loading}>
            <RefreshCw size={16} className={'mr-1 ' + (loading ? 'animate-spin' : '')} /> Rafraichir
          </button>
          <button onClick={runAll} className="btn btn-secondary" disabled={running}>
            <PlayCircle size={16} className="mr-1" /> Verifier tout
          </button>
          <button onClick={runDigest} className="btn btn-secondary">
            <Mail size={16} className="mr-1" /> Tester recap email
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={ShieldCheck} label="Surveilles" value={c.tracked} sub={c.untracked + ' desactives'} color="text-emerald-500" />
        <StatCard icon={ShieldAlert} label="Expires" value={c.expired} color="text-red-600" />
        <StatCard icon={AlertTriangle} label="< 7 jours" value={c.in7} color="text-red-500" />
        <StatCard icon={AlertTriangle} label="< 30 jours" value={c.in30} color="text-amber-500" />
        <StatCard icon={Clock} label="< 60 jours" value={c.in60} color="text-yellow-500" />
        <StatCard icon={Clock} label="< 90 jours" value={c.in90} color="text-slate-500" />
      </div>

      {/* Erreurs de monitoring */}
      {data.errors.length > 0 && (
        <div className="card p-6 border-l-4 border-red-500">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="text-red-500" size={20} />
            <h2 className="text-lg font-semibold">Erreurs de surveillance ({data.errors.length})</h2>
          </div>
          <p className="text-sm text-slate-500 mb-3">
            Le dernier check a echoue pour ces assets. Verifiez l'identifiant (FQDN / domaine) ou le reseau.
          </p>
          <div className="space-y-2">
            {data.errors.map((e) => (
              <div key={e.id} className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="font-medium">
                      {e.type === 'CERTIFICATE' ? <Lock size={14} className="inline mr-1" /> : <Globe size={14} className="inline mr-1" />}
                      {e.name}
                    </span>
                    <span className="text-slate-500"> - </span>
                    <Link href={'/companies/' + e.company.id} className="text-mdo-600 hover:underline">{e.company.name}</Link>
                    {e.identifier && <span className="ml-2 font-mono text-xs text-slate-500">{e.identifier}</span>}
                  </div>
                  <button onClick={() => checkOne(e.id, e.name)} className="text-mdo-600 hover:text-mdo-700" title="Reessayer">
                    <RefreshCw size={14} />
                  </button>
                </div>
                <p className="text-xs text-red-700 dark:text-red-400 mt-1">{e.monitoringError}</p>
                {e.lastMonitoredAt && (
                  <p className="text-xs text-slate-400 mt-0.5">Dernier essai : {formatDate(e.lastMonitoredAt)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liste consolidee */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold">Echeances dans les 90 prochains jours ({data.items.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-700 text-left">
            <tr>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Identifiant</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">Expire le</th>
              <th className="p-3 font-medium">Restant</th>
              <th className="p-3 font-medium">Dernier check</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-400">
                  Aucun asset n'expire dans les 90 prochains jours. Vous etes serein.
                </td>
              </tr>
            ) : data.items.map((it) => (
              <tr key={it.id} className="border-t border-slate-200 dark:border-slate-700">
                <td className="p-3">
                  {it.type === 'CERTIFICATE' ? (
                    <span className="inline-flex items-center gap-1"><Lock size={14} /> Cert</span>
                  ) : (
                    <span className="inline-flex items-center gap-1"><Globe size={14} /> Dom</span>
                  )}
                </td>
                <td className="p-3 font-mono text-xs">{it.identifier ?? it.name}</td>
                <td className="p-3">
                  <Link href={'/companies/' + it.company.id} className="text-mdo-600 hover:underline">
                    {it.company.name}
                  </Link>
                </td>
                <td className="p-3">{formatDate(it.expiresAt)}</td>
                <td className="p-3">
                  <span className={'inline-block px-2 py-0.5 rounded text-xs font-medium ' + bucketColor(it.daysRemaining)}>
                    {it.daysRemaining < 0
                      ? 'expire depuis ' + Math.abs(it.daysRemaining) + ' j'
                      : 'dans ' + it.daysRemaining + ' j'}
                  </span>
                </td>
                <td className="p-3 text-xs text-slate-500">
                  {it.lastMonitoredAt ? formatDate(it.lastMonitoredAt) : 'jamais'}
                </td>
                <td className="p-3">
                  <button
                    onClick={() => checkOne(it.id, it.name)}
                    className="text-mdo-600 hover:text-mdo-700"
                    title="Verifier maintenant"
                  >
                    <RefreshCw size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
