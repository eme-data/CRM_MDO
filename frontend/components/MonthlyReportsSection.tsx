'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  FileBarChart,
  Download,
  Send,
  Trash2,
  Plus,
  Copy,
  Eye,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';

interface ClientReport {
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
  lastDownloadAt: string | null;
  summary: any;
  createdAt: string;
}

const STATUS_CONF: Record<ClientReport['status'], { label: string; cls: string; icon: any }> = {
  GENERATED: { label: 'Genere', cls: 'bg-slate-100 text-slate-700', icon: FileBarChart },
  SENT: { label: 'Envoye', cls: 'bg-blue-100 text-blue-700', icon: Send },
  DOWNLOADED: { label: 'Telecharge', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  EXPIRED: { label: 'Expire', cls: 'bg-amber-100 text-amber-700', icon: AlertCircle },
};

export function MonthlyReportsSection({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<ClientReport[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(() => {
    // Defaut : mois precedent (cas le plus frequent)
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const confirm = useConfirm();

  async function load() {
    try {
      setItems(await api.get(`/companies/${companyId}/reports`));
    } catch (err: any) {
      toast.error(err.message ?? 'Erreur chargement rapports');
    }
  }
  useEffect(() => { load(); }, [companyId]);

  async function generate(force: boolean) {
    setBusy(true);
    const t = toast.loading('Generation du rapport...');
    try {
      await api.post(`/companies/${companyId}/reports/generate`, { month, force });
      toast.dismiss(t);
      toast.success('Rapport genere');
      load();
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err.message ?? 'Echec generation');
    } finally {
      setBusy(false);
    }
  }

  async function sendEmail(id: string) {
    const ok = await confirm({
      title: 'Envoyer le rapport au client ?',
      message: 'Un email contenant un lien securise sera envoye au contact principal de la societe. Le lien expire 30 jours apres generation.',
      confirmLabel: 'Envoyer',
      tone: 'info',
    });
    if (!ok) return;
    const t = toast.loading('Envoi en cours...');
    try {
      await api.post(`/client-reports/${id}/send`);
      toast.dismiss(t);
      toast.success('Email envoye');
      load();
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err.message);
    }
  }

  async function copyLink(token: string) {
    const base = window.location.origin;
    await navigator.clipboard.writeText(`${base}/api/reports/download/${token}`);
    toast.success('Lien copie');
  }

  async function downloadAdmin(id: string) {
    const token = localStorage.getItem('crm_mdo_access_token');
    const res = await fetch(`/api/client-reports/${id}/pdf`, {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    });
    if (!res.ok) { toast.error('Erreur telechargement'); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function remove(id: string, periodStart: string) {
    const ok = await confirm({
      title: 'Supprimer ce rapport ?',
      message: `Le rapport de ${formatPeriod(periodStart)} sera supprime, ainsi que son fichier PDF. Le lien de telechargement deviendra inutilisable.`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/client-reports/${id}`);
      toast.success('Rapport supprime');
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <FileBarChart size={18} className="text-mdo-500" />
            Rapports mensuels client
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Synthese mensuelle (tickets, interventions, surveillance, uptime, inventaire) — auto-genere le 1er du mois.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="input max-w-[160px]"
          />
          <button onClick={() => generate(false)} disabled={busy} className="btn btn-primary">
            <Plus size={14} className="mr-1" />
            {busy ? '...' : 'Generer'}
          </button>
        </div>
      </div>

      {items === null ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileBarChart}
          title="Aucun rapport pour ce client"
          description="Generez le premier rapport mensuel ou attendez le cron automatique du 1er du mois."
        />
      ) : (
        <div className="space-y-2">
          {items.map((r) => {
            const conf = STATUS_CONF[r.status];
            const Icon = conf.icon;
            return (
              <div key={r.id} className="rounded-md border border-slate-200 dark:border-slate-700 p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon size={18} className="text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium">{formatPeriod(r.periodStart)}</p>
                      <p className="text-xs text-slate-500">
                        {r.summary?.tickets ?? '-'} tickets · {r.summary?.interventions ?? 0} interventions
                        {r.summary?.uptimeAvgPct !== null && r.summary?.uptimeAvgPct !== undefined
                          ? ` · uptime ${Number(r.summary.uptimeAvgPct).toFixed(1)} %`
                          : ''}
                        {r.summary?.inventoryTotal ? ` · ${r.summary.inventoryTotal} assets` : ''}
                      </p>
                    </div>
                  </div>
                  <span className={'badge ' + conf.cls}>{conf.label}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-2 text-xs text-slate-500">
                  <span title="Genere le">
                    <Clock size={11} className="inline mr-0.5" />
                    {formatDateTime(r.createdAt)}
                  </span>
                  <span>·</span>
                  <span>PDF {(r.pdfSize / 1024).toFixed(0)} Ko</span>
                  {r.sentAt && r.sentTo && (
                    <>
                      <span>·</span>
                      <span>envoye a {r.sentTo} ({formatDate(r.sentAt)})</span>
                    </>
                  )}
                  {r.downloadCount > 0 && (
                    <>
                      <span>·</span>
                      <span>
                        <Eye size={11} className="inline mr-0.5" />
                        {r.downloadCount} tel.
                      </span>
                    </>
                  )}
                  <span>·</span>
                  <span>lien expire le {formatDate(r.tokenExpiresAt)}</span>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <button onClick={() => downloadAdmin(r.id)} className="btn btn-secondary text-xs py-1">
                    <Download size={12} className="mr-1" /> Telecharger
                  </button>
                  <button onClick={() => copyLink(r.accessToken)} className="btn btn-secondary text-xs py-1" disabled={r.status === 'EXPIRED'}>
                    <Copy size={12} className="mr-1" /> Copier le lien
                  </button>
                  <button
                    onClick={() => sendEmail(r.id)}
                    className="btn btn-primary text-xs py-1"
                    disabled={r.status === 'EXPIRED'}
                  >
                    <Send size={12} className="mr-1" /> {r.sentAt ? 'Renvoyer' : 'Envoyer au client'}
                  </button>
                  <button
                    onClick={() => remove(r.id, r.periodStart)}
                    aria-label="Supprimer le rapport"
                    className="ml-auto text-red-500 hover:text-red-700"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatPeriod(periodStart: string): string {
  const d = new Date(periodStart);
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}
