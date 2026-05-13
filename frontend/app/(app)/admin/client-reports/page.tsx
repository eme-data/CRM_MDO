'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  FileBarChart,
  Download,
  Send,
  Trash2,
  Copy,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableRowSkeleton } from '@/components/ui/Skeleton';

interface AdminReport {
  id: string;
  periodStart: string;
  periodEnd: string;
  pdfSize: number;
  accessToken: string;
  tokenExpiresAt: string;
  status: 'GENERATED' | 'SENT' | 'DOWNLOADED' | 'EXPIRED';
  sentTo: string | null;
  sentAt: string | null;
  downloadCount: number;
  createdAt: string;
  company: { id: string; name: string };
  summary: any;
}

const STATUS_LABEL: Record<string, string> = {
  GENERATED: 'Genere',
  SENT: 'Envoye',
  DOWNLOADED: 'Telecharge',
  EXPIRED: 'Expire',
};
const STATUS_COLOR: Record<string, string> = {
  GENERATED: 'bg-slate-100 text-slate-700',
  SENT: 'bg-blue-100 text-blue-700',
  DOWNLOADED: 'bg-emerald-100 text-emerald-700',
  EXPIRED: 'bg-amber-100 text-amber-700',
};

export default function AdminClientReportsPage() {
  const [items, setItems] = useState<AdminReport[] | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const confirm = useConfirm();

  async function load() {
    const qs = statusFilter ? '?status=' + statusFilter : '';
    setItems(await api.get('/client-reports' + qs));
  }
  useEffect(() => { load(); }, [statusFilter]);

  async function sendEmail(id: string, company: string) {
    const ok = await confirm({
      title: 'Envoyer ce rapport ?',
      message: `Le rapport sera envoye au contact principal de ${company}.`,
      confirmLabel: 'Envoyer',
      tone: 'info',
    });
    if (!ok) return;
    try {
      await api.post(`/client-reports/${id}/send`);
      toast.success('Email envoye');
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/api/reports/download/${token}`);
    toast.success('Lien copie');
  }

  async function downloadAdmin(id: string) {
    const token = localStorage.getItem('crm_mdo_access_token');
    const res = await fetch(`/api/client-reports/${id}/pdf`, {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    });
    if (!res.ok) { toast.error('Erreur'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rapport.pdf';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function remove(id: string, company: string, period: string) {
    const ok = await confirm({
      title: 'Supprimer ce rapport ?',
      message: `Le rapport de ${company} pour ${period} sera supprime, fichier PDF inclus.`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/client-reports/${id}`);
      toast.success('Rapport supprime');
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Rapports mensuels clients</h1>
        <p className="text-sm text-slate-500 mt-1">
          Historique global des rapports generes (manuellement ou via le cron du 1er du mois a 8h).
        </p>
      </div>

      <div className="card p-4 flex items-center gap-3">
        <select className="input max-w-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tous statuts</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-700 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-3 font-medium">Periode</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">Resume</th>
              <th className="p-3 font-medium">Statut</th>
              <th className="p-3 font-medium">Envoi</th>
              <th className="p-3 font-medium">Tel.</th>
              <th className="p-3 font-medium">Expire</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items === null ? (
              Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={8} />)
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="p-0">
                <EmptyState
                  icon={FileBarChart}
                  title="Aucun rapport"
                  description={statusFilter ? "Aucun rapport ne correspond a ce filtre." : "Les rapports apparaitront ici une fois generes (manuellement ou par le cron mensuel)."}
                />
              </td></tr>
            ) : items.map((r) => {
              const period = new Date(r.periodStart).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
              return (
                <tr key={r.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="p-3 font-medium capitalize">{period}</td>
                  <td className="p-3">
                    <Link href={`/companies/${r.company.id}`} className="text-mdo-600 hover:underline">{r.company.name}</Link>
                  </td>
                  <td className="p-3 text-xs text-slate-500">
                    {r.summary?.tickets ?? '-'} tkt
                    {r.summary?.interventions ? ` · ${r.summary.interventions} int.` : ''}
                    {r.summary?.uptimeAvgPct !== null && r.summary?.uptimeAvgPct !== undefined
                      ? ` · ${Number(r.summary.uptimeAvgPct).toFixed(1)} %`
                      : ''}
                  </td>
                  <td className="p-3">
                    <span className={'badge ' + STATUS_COLOR[r.status]}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  <td className="p-3 text-xs">
                    {r.sentAt ? (
                      <div>
                        <div>{r.sentTo}</div>
                        <div className="text-slate-400">{formatDate(r.sentAt)}</div>
                      </div>
                    ) : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="p-3 text-center tabular-nums">{r.downloadCount}</td>
                  <td className="p-3 text-xs text-slate-500">{formatDate(r.tokenExpiresAt)}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => downloadAdmin(r.id)} aria-label="Telecharger" title="Telecharger" className="text-slate-500 hover:text-mdo-600">
                        <Download size={14} />
                      </button>
                      <button onClick={() => copyLink(r.accessToken)} aria-label="Copier le lien" title="Copier le lien public" className="text-slate-500 hover:text-mdo-600" disabled={r.status === 'EXPIRED'}>
                        <Copy size={14} />
                      </button>
                      <button onClick={() => sendEmail(r.id, r.company.name)} aria-label="Envoyer" title={r.sentAt ? 'Renvoyer au client' : 'Envoyer au client'} className="text-slate-500 hover:text-mdo-600" disabled={r.status === 'EXPIRED'}>
                        <Send size={14} />
                      </button>
                      <button onClick={() => remove(r.id, r.company.name, period)} aria-label="Supprimer" title="Supprimer" className="text-red-500 hover:text-red-700">
                        <Trash2 size={14} />
                      </button>
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
