'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FileText, LifeBuoy, Server, Plus, ArrowRight, Receipt, Activity,
  ShieldCheck, HardDrive, FolderOpen, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { portalApi } from '@/lib/portal-api';

interface DashboardData {
  openTickets: number;
  activeContracts: number;
  monitoredAssets: number;
  unpaidInvoices: number;
  uptimeDown: number;
  uptimeTotal: number;
  cyberScorePercent: number | null;
  backupsKo: number;
  backupsTotal: number;
  expiringDocs: number;
  visibleDocs: number;
}

export default function PortalHomePage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    Promise.all([
      portalApi.get('/tickets').catch(() => []),
      portalApi.get('/contracts').catch(() => []),
      portalApi.get('/assets').catch(() => []),
      portalApi.get('/invoices').catch(() => []),
      portalApi.get('/uptime').catch(() => []),
      portalApi.get('/cyber-score').catch(() => null),
      portalApi.get('/backups').catch(() => []),
      portalApi.get('/documents').catch(() => []),
    ])
      .then(([tickets, contracts, assets, invoices, uptime, cyber, backups, documents]: any[]) => {
        const now = Date.now();
        // Bucket "expiring" = doc qui expire dans <= 30j
        const expiringDocs = (documents as any[]).filter(
          (d) => d.expiresAt && new Date(d.expiresAt).getTime() - now <= 30 * 86400_000,
        ).length;
        // Backup KO = lastRunStatus FAILED ou en retard (pas de success > expectedFrequencyHours)
        const backupsKo = (backups as any[]).filter((b) => {
          if (b.lastRunStatus === 'FAILED') return true;
          if (!b.lastSuccessAt) return true;
          const sinceLastSuccess = now - new Date(b.lastSuccessAt).getTime();
          return sinceLastSuccess > b.expectedFrequencyHours * 3600_000;
        }).length;
        setData({
          openTickets: (tickets as any[]).filter(
            (t) => !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(t.status),
          ).length,
          activeContracts: (contracts as any[]).filter((c) => c.status === 'ACTIVE').length,
          monitoredAssets: (assets as any[]).filter((a) => a.monitoringEnabled).length,
          unpaidInvoices: (invoices as any[]).filter(
            (i) => i.status === 'ISSUED' || i.status === 'OVERDUE',
          ).length,
          uptimeDown: (uptime as any[]).filter((u) => u.lastStatus === 'DOWN').length,
          uptimeTotal: (uptime as any[]).length,
          cyberScorePercent: cyber?.percent ?? null,
          backupsKo,
          backupsTotal: (backups as any[]).length,
          expiringDocs,
          visibleDocs: (documents as any[]).length,
        });
      })
      .catch(() => setData(null));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Bienvenue</h1>
        <p className="text-sm text-slate-500 mt-1">
          Vue d'ensemble de vos services geres par MDO Services.
        </p>
      </div>

      {/* Alertes rouges en haut si quelque chose ne va pas */}
      {data && (data.uptimeDown > 0 || data.unpaidInvoices > 0 || data.backupsKo > 0 || data.expiringDocs > 0) && (
        <div className="card p-4 border-amber-300 bg-amber-50 space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-amber-900">
            <AlertTriangle size={16} /> Points d'attention
          </h2>
          <ul className="text-sm space-y-1 text-amber-900">
            {data.uptimeDown > 0 && (
              <li>
                <Link href="/portal/uptime" className="hover:underline">
                  {data.uptimeDown} site(s) hors ligne
                </Link>
              </li>
            )}
            {data.unpaidInvoices > 0 && (
              <li>
                <Link href="/portal/invoices" className="hover:underline">
                  {data.unpaidInvoices} facture(s) en attente de reglement
                </Link>
              </li>
            )}
            {data.backupsKo > 0 && (
              <li>
                <Link href="/portal/backups" className="hover:underline">
                  {data.backupsKo} sauvegarde(s) en echec ou en retard
                </Link>
              </li>
            )}
            {data.expiringDocs > 0 && (
              <li>
                <Link href="/portal/documents" className="hover:underline">
                  {data.expiringDocs} document(s) expirent dans les 30 jours
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <PortalCard
          icon={LifeBuoy}
          label="Tickets ouverts"
          value={data?.openTickets}
          href="/portal/tickets"
          color="text-blue-500"
        />
        <PortalCard
          icon={FileText}
          label="Contrats actifs"
          value={data?.activeContracts}
          href="/portal/contracts"
          color="text-emerald-500"
        />
        <PortalCard
          icon={Receipt}
          label="Factures a regler"
          value={data?.unpaidInvoices}
          href="/portal/invoices"
          color={data && data.unpaidInvoices > 0 ? 'text-amber-500' : 'text-slate-400'}
        />
        <PortalCard
          icon={Activity}
          label="Sites en ligne"
          value={data ? data.uptimeTotal - data.uptimeDown : undefined}
          suffix={data ? '/ ' + data.uptimeTotal : undefined}
          href="/portal/uptime"
          color={data && data.uptimeDown > 0 ? 'text-red-500' : 'text-emerald-500'}
        />
        <PortalCard
          icon={ShieldCheck}
          label="Cyber Score"
          value={data?.cyberScorePercent != null ? Math.round(data.cyberScorePercent) : undefined}
          suffix={data?.cyberScorePercent != null ? '/ 100' : undefined}
          href="/portal/cyber-score"
          color={
            data?.cyberScorePercent == null
              ? 'text-slate-400'
              : data.cyberScorePercent >= 70
                ? 'text-emerald-500'
                : data.cyberScorePercent >= 50
                  ? 'text-amber-500'
                  : 'text-red-500'
          }
        />
        <PortalCard
          icon={HardDrive}
          label="Sauvegardes OK"
          value={data ? data.backupsTotal - data.backupsKo : undefined}
          suffix={data ? '/ ' + data.backupsTotal : undefined}
          href="/portal/backups"
          color={data && data.backupsKo > 0 ? 'text-red-500' : 'text-emerald-500'}
        />
        <PortalCard
          icon={FolderOpen}
          label="Documents partages"
          value={data?.visibleDocs}
          href="/portal/documents"
          color="text-purple-500"
        />
        <PortalCard
          icon={Server}
          label="Assets surveilles"
          value={data?.monitoredAssets}
          href="/portal/assets"
          color="text-purple-500"
        />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-semibold mb-2">Besoin d'aide ?</h2>
        <p className="text-sm text-slate-500 mb-4">
          Ouvrez un ticket de support pour signaler un incident, faire une demande ou poser une question.
          L'equipe MDO Services prend en charge votre demande dans les meilleurs delais.
        </p>
        <Link
          href="/portal/tickets/new"
          className="inline-flex items-center gap-2 rounded-md bg-mdo-600 text-white px-4 py-2 text-sm font-medium hover:bg-mdo-700 transition-colors"
        >
          <Plus size={14} /> Nouveau ticket
        </Link>
      </div>
    </div>
  );
}

function PortalCard({
  icon: Icon,
  label,
  value,
  suffix,
  href,
  color,
}: {
  icon: any;
  label: string;
  value: number | undefined;
  suffix?: string;
  href: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-5 hover:border-mdo-400 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-500 truncate">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums">
            {value !== undefined ? value : '—'}
            {suffix && <span className="text-sm font-normal text-slate-400 ml-1">{suffix}</span>}
          </p>
        </div>
        <Icon size={20} className={color + ' shrink-0'} />
      </div>
      <div className="mt-3 inline-flex items-center gap-1 text-xs text-mdo-600 group-hover:gap-2 transition-all">
        Voir le detail <ArrowRight size={12} />
      </div>
    </Link>
  );
}
