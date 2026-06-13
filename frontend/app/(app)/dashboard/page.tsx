'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Target,
  FileText,
  TrendingUp,
  AlertTriangle,
  Clock,
  LifeBuoy,
  Shield,
  Lock,
  Globe,
  Activity,
  XCircle,
  Inbox,
} from 'lucide-react';
import { api } from '@/lib/api';
import { me as fetchMe } from '@/lib/auth';
import { hasFeature } from '@/lib/modules';
import { formatEuro, formatDate, contractOfferLabel } from '@/lib/utils';
import { StatCardSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

interface Dashboard {
  companies: { total: number; customers: number; prospects: number };
  opportunities: { open: number; pipelineValueHt: number };
  tasks: { dueToday: number };
  contracts: {
    activeCount: number;
    mrrHt: number;
    expiringIn30: number;
    expiringIn60: number;
    expiringIn90: number;
  };
  tickets: {
    open: number;
    inProgress: number;
    waiting: number;
    overdue: number;
    resolvedThisMonth: number;
  };
  expiringSoon: Array<{
    id: string;
    reference: string;
    title: string;
    offer: string;
    endDate: string;
    monthlyAmountHt: number;
    daysRemaining: number;
    company: { name: string };
  }>;
  recentActivities: Array<{
    id: string;
    action: string;
    entity: string;
    createdAt: string;
    user: { firstName: string; lastName: string };
  }>;
}

interface UptimeWidget {
  counts: { total: number; up: number; down: number; unknown: number };
  monitors: Array<{
    id: string;
    name: string;
    url: string;
    enabled: boolean;
    lastStatus: 'UP' | 'DOWN' | null;
    lastResponseMs: number | null;
    company: { id: string; name: string } | null;
  }>;
}

interface SurveillanceWidget {
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
  items: Array<{
    id: string;
    name: string;
    type: 'CERTIFICATE' | 'DOMAIN';
    identifier: string | null;
    expiresAt: string;
    daysRemaining: number;
    company: { id: string; name: string };
  }>;
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  href,
  color = 'text-mdo-500',
  tone = 'default',
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  color?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneAccent: Record<string, string> = {
    default: '',
    success: 'border-l-4 border-l-emerald-500',
    warning: 'border-l-4 border-l-amber-500',
    danger: 'border-l-4 border-l-red-500',
  };
  const body = (
    <div className={`card p-5 transition-shadow hover:shadow-md ${toneAccent[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-400 truncate">{sub}</p>}
        </div>
        <Icon size={28} className={`${color} shrink-0`} />
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-mdo-500 rounded-lg">
      {body}
    </Link>
  ) : body;
}

function SectionTitle({ icon: Icon, color, children, action }: {
  icon: any; color: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon size={20} className={color} />
        <h2 className="text-lg font-semibold">{children}</h2>
      </div>
      {action}
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [surveillance, setSurveillance] = useState<SurveillanceWidget | null>(null);
  const [uptime, setUptime] = useState<UptimeWidget | null>(null);
  const [loadingSurv, setLoadingSurv] = useState(true);
  const [loadingUp, setLoadingUp] = useState(true);
  // Widgets metier IT (surveillance certs/domaines + uptime) : affiches uniquement
  // si la specialite Infogerance (infra.monitoring) est activee pour le tenant.
  const [showInfra, setShowInfra] = useState(false);

  useEffect(() => {
    api.get('/dashboard').then(setData).catch(console.error);
    fetchMe().then((u) => {
      if (!hasFeature(u.modules, 'infra.monitoring')) { setLoadingSurv(false); setLoadingUp(false); return; }
      setShowInfra(true);
      api.get('/monitoring/overview').then(setSurveillance).catch(console.error).finally(() => setLoadingSurv(false));
      api.get('/uptime/overview').then(setUptime).catch(console.error).finally(() => setLoadingUp(false));
    }).catch(() => { setLoadingSurv(false); setLoadingUp(false); });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tableau de bord</h1>
        <p className="text-sm text-slate-500 mt-1">Vue d'ensemble de votre activite MSP</p>
      </div>

      {!data ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat
              icon={Building2}
              label="Societes"
              value={data.companies.total}
              sub={`${data.companies.customers} clients - ${data.companies.prospects} prospects`}
              href="/companies"
            />
            <Stat
              icon={Target}
              label="Opportunites ouvertes"
              value={data.opportunities.open}
              sub={'Pipeline : ' + formatEuro(data.opportunities.pipelineValueHt)}
              href="/opportunities"
            />
            <Stat
              icon={FileText}
              label="Contrats actifs"
              value={data.contracts.activeCount}
              sub={'MRR : ' + formatEuro(data.contracts.mrrHt)}
              href="/contracts"
              color="text-emerald-500"
              tone="success"
            />
            <Stat
              icon={AlertTriangle}
              label="Expirent < 30j"
              value={data.contracts.expiringIn30}
              sub={`${data.contracts.expiringIn60} en <60j, ${data.contracts.expiringIn90} en <90j`}
              href="/contracts?expiringInDays=30"
              color="text-red-500"
              tone={data.contracts.expiringIn30 > 0 ? 'danger' : 'default'}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat
              icon={LifeBuoy}
              label="Tickets ouverts"
              value={data.tickets.open + data.tickets.inProgress}
              sub={`${data.tickets.open} nouveaux - ${data.tickets.inProgress} en cours`}
              href="/tickets?status=OPEN"
              color="text-blue-500"
            />
            <Stat
              icon={Clock}
              label="Attente client"
              value={data.tickets.waiting}
              sub="A relancer"
              href="/tickets?status=WAITING_CUSTOMER"
              color="text-purple-500"
            />
            <Stat
              icon={AlertTriangle}
              label="Tickets en retard"
              value={data.tickets.overdue}
              sub="SLA depasse"
              href="/tickets"
              color="text-red-500"
              tone={data.tickets.overdue > 0 ? 'danger' : 'default'}
            />
            <Stat
              icon={LifeBuoy}
              label="Resolus ce mois"
              value={data.tickets.resolvedThisMonth}
              color="text-emerald-500"
              tone="success"
            />
          </div>
        </>
      )}

      {showInfra && (
      <>
      <div className="card p-6">
        <SectionTitle
          icon={Shield}
          color="text-mdo-500"
          action={<Link href="/surveillance" className="text-sm text-mdo-600 hover:underline">Voir tout →</Link>}
        >
          Surveillance certificats &amp; domaines
        </SectionTitle>
        {loadingSurv ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : !surveillance || surveillance.counts.tracked === 0 ? (
          <EmptyState
            icon={Shield}
            title="Aucun asset surveille"
            description="Activez la surveillance sur un certificat ou domaine depuis la page Assets."
            action={<Link href="/assets" className="btn btn-primary">Ouvrir les assets</Link>}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-900/30 p-3 text-center">
                <p className="text-xs text-slate-500">Surveilles</p>
                <p className="text-xl font-bold text-emerald-600 tabular-nums">{surveillance.counts.tracked}</p>
              </div>
              <div className="rounded-md bg-red-50 dark:bg-red-900/30 p-3 text-center">
                <p className="text-xs text-slate-500">Expires</p>
                <p className="text-xl font-bold text-red-600 tabular-nums">{surveillance.counts.expired}</p>
              </div>
              <div className="rounded-md bg-red-50 dark:bg-red-900/30 p-3 text-center">
                <p className="text-xs text-slate-500">&lt; 7j</p>
                <p className="text-xl font-bold text-red-500 tabular-nums">{surveillance.counts.in7}</p>
              </div>
              <div className="rounded-md bg-amber-50 dark:bg-amber-900/30 p-3 text-center">
                <p className="text-xs text-slate-500">&lt; 30j</p>
                <p className="text-xl font-bold text-amber-600 tabular-nums">{surveillance.counts.in30}</p>
              </div>
              <div className="rounded-md bg-slate-100 dark:bg-slate-700 p-3 text-center">
                <p className="text-xs text-slate-500">Erreurs</p>
                <p className="text-xl font-bold text-slate-600 dark:text-slate-300 tabular-nums">{surveillance.counts.withErrors}</p>
              </div>
            </div>
            {surveillance.items.slice(0, 5).length > 0 && (
              <div className="space-y-1">
                {surveillance.items.slice(0, 5).map((it) => (
                  <Link
                    key={it.id}
                    href="/surveillance"
                    className="flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 p-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {it.type === 'CERTIFICATE'
                        ? <Lock size={14} className="shrink-0 text-slate-400" />
                        : <Globe size={14} className="shrink-0 text-slate-400" />}
                      <span className="font-mono text-xs truncate">{it.identifier ?? it.name}</span>
                      <span className="text-slate-400">·</span>
                      <span className="truncate">{it.company.name}</span>
                    </div>
                    <span className={
                      'badge shrink-0 ml-2 ' +
                      (it.daysRemaining < 0 ? 'bg-red-100 text-red-700'
                        : it.daysRemaining <= 7 ? 'bg-red-100 text-red-700'
                        : it.daysRemaining <= 30 ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-700')
                    }>
                      {it.daysRemaining < 0 ? 'expire ' + Math.abs(it.daysRemaining) + 'j' : it.daysRemaining + ' j'}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="card p-6">
        <SectionTitle
          icon={Activity}
          color="text-mdo-500"
          action={<Link href="/uptime" className="text-sm text-mdo-600 hover:underline">Voir tout →</Link>}
        >
          Uptime sites clients
        </SectionTitle>
        {loadingUp ? (
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : !uptime || uptime.counts.total === 0 ? (
          <EmptyState
            icon={Activity}
            title="Aucun site surveille"
            description="Ajoutez un moniteur HTTP pour surveiller la disponibilite d'un site client."
            action={<Link href="/uptime" className="btn btn-primary">Ouvrir Uptime</Link>}
          />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-900/30 p-3 text-center">
                <p className="text-xs text-slate-500">UP</p>
                <p className="text-xl font-bold text-emerald-600 tabular-nums">{uptime.counts.up}</p>
              </div>
              <div className="rounded-md bg-red-50 dark:bg-red-900/30 p-3 text-center">
                <p className="text-xs text-slate-500">DOWN</p>
                <p className="text-xl font-bold text-red-600 tabular-nums">{uptime.counts.down}</p>
              </div>
              <div className="rounded-md bg-slate-100 dark:bg-slate-700 p-3 text-center">
                <p className="text-xs text-slate-500">Total surveilles</p>
                <p className="text-xl font-bold tabular-nums">{uptime.counts.total}</p>
              </div>
            </div>
            {uptime.monitors.filter((m) => m.lastStatus === 'DOWN').length > 0 && (
              <div className="space-y-1">
                {uptime.monitors.filter((m) => m.lastStatus === 'DOWN').slice(0, 5).map((m) => (
                  <Link
                    key={m.id}
                    href={'/uptime/' + m.id}
                    className="flex items-center justify-between rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-2 text-sm hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <XCircle size={14} className="shrink-0 text-red-500" />
                      <span className="font-medium truncate">{m.name}</span>
                      {m.company && <><span className="text-slate-400">·</span><span className="truncate text-slate-500">{m.company.name}</span></>}
                    </div>
                    <span className="badge bg-red-100 text-red-700 shrink-0 ml-2">DOWN</span>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card p-6">
          <SectionTitle icon={Clock} color="text-amber-500">
            Contrats qui expirent bientot
          </SectionTitle>
          {!data ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : data.expiringSoon.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Aucun contrat n'expire dans les 90 prochains jours"
              description="Vos renouvellements sont a jour."
            />
          ) : (
            <div className="space-y-2">
              {data.expiringSoon.map((c) => (
                <Link
                  key={c.id}
                  href={'/contracts/' + c.id}
                  className="block rounded-md border border-slate-200 dark:border-slate-700 p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{c.reference} · {c.company.name}</p>
                      <p className="text-sm text-slate-500 truncate">
                        {contractOfferLabel[c.offer]} · {formatEuro(c.monthlyAmountHt)}/mois HT
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={
                          'badge ' +
                          (c.daysRemaining <= 30
                            ? 'bg-red-100 text-red-700'
                            : c.daysRemaining <= 60
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-700')
                        }
                      >
                        {c.daysRemaining} jours
                      </span>
                      <p className="text-xs text-slate-400 mt-1">
                        Fin : {formatDate(c.endDate)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6">
          <SectionTitle icon={TrendingUp} color="text-mdo-500">
            Activite recente
          </SectionTitle>
          {!data ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5" />)}
            </div>
          ) : data.recentActivities.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune activite recente.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {data.recentActivities.map((a) => (
                <div key={a.id} className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                  <span className="text-xs text-slate-400 mt-0.5 whitespace-nowrap shrink-0">
                    {formatDate(a.createdAt)}
                  </span>
                  <span className="truncate">
                    {a.user.firstName} {a.user.lastName} · {a.action} {a.entity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
