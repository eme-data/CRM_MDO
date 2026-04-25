'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Users,
  Target,
  FileText,
  TrendingUp,
  AlertTriangle,
  Clock,
  LifeBuoy,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatEuro, formatDate, daysUntil, contractOfferLabel } from '@/lib/utils';

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

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  href,
  color = 'text-mdo-500',
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  color?: string;
}) {
  const body = (
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
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    api.get('/dashboard').then(setData).catch(console.error);
  }, []);

  if (!data) return <div>Chargement...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Tableau de bord</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          icon={Building2}
          label="Societes"
          value={data.companies.total}
          sub={data.companies.customers + ' clients, ' + data.companies.prospects + ' prospects'}
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
        />
        <Stat
          icon={AlertTriangle}
          label="Expirent < 30j"
          value={data.contracts.expiringIn30}
          sub={data.contracts.expiringIn60 + ' en < 60j, ' + data.contracts.expiringIn90 + ' en < 90j'}
          href="/contracts?expiringInDays=30"
          color="text-red-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          icon={LifeBuoy}
          label="Tickets ouverts"
          value={data.tickets.open + data.tickets.inProgress}
          sub={data.tickets.open + ' nouveaux, ' + data.tickets.inProgress + ' en cours'}
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
        />
        <Stat
          icon={LifeBuoy}
          label="Resolus ce mois"
          value={data.tickets.resolvedThisMonth}
          color="text-emerald-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={20} className="text-amber-500" />
            <h2 className="text-lg font-semibold">Contrats qui expirent bientot</h2>
          </div>
          {data.expiringSoon.length === 0 ? (
            <p className="text-slate-400 text-sm">Aucun contrat n'expire dans les 90 prochains jours.</p>
          ) : (
            <div className="space-y-2">
              {data.expiringSoon.map((c) => (
                <Link
                  key={c.id}
                  href={'/contracts/' + c.id}
                  className="block rounded-md border border-slate-200 p-3 hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{c.reference} - {c.company.name}</p>
                      <p className="text-sm text-slate-500">
                        {contractOfferLabel[c.offer]} - {formatEuro(c.monthlyAmountHt)}/mois HT
                      </p>
                    </div>
                    <div className="text-right">
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
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={20} className="text-mdo-500" />
            <h2 className="text-lg font-semibold">Activite recente</h2>
          </div>
          <div className="space-y-2 text-sm">
            {data.recentActivities.map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-slate-600">
                <span className="text-xs text-slate-400 mt-0.5 whitespace-nowrap">
                  {formatDate(a.createdAt)}
                </span>
                <span>
                  {a.user.firstName} {a.user.lastName} - {a.action} {a.entity}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
