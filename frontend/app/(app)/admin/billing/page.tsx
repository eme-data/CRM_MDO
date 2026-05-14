'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Receipt, RefreshCw, Database, ExternalLink, AlertCircle, CheckCircle2, AlertTriangle, Banknote } from 'lucide-react';
import { api } from '@/lib/api';

interface BillingStatus {
  provider: string; // none / qonto
  configured: boolean;
  autoPushContracts: boolean;
  disableInternalCron: boolean;
  qontoConfigured: boolean;
  qontoSyncEnabled: boolean;
}

export default function AdminBillingPage() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    try {
      setStatus(await api.get('/billing/status'));
    } catch (err: any) {
      toast.error(err.message ?? 'Acces refuse');
    }
  }
  useEffect(() => { load(); }, []);

  async function syncQonto() {
    setSyncing(true);
    try {
      const r = await api.post('/billing/qonto/sync', { sinceDays: 7 });
      toast.success(r.imported + ' transactions importees');
    } catch (err: any) {
      toast.error(err.message ?? 'Echec sync Qonto');
    } finally {
      setSyncing(false);
    }
  }

  if (!status) return <div>Chargement...</div>;

  const providerLabel =
    status.provider === 'qonto' ? 'Qonto'
    : 'Aucun (mode interne)';

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Receipt size={28} /> Tableau de bord facturation
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Synchronisation entre le CRM et l'outil de facturation electronique (PDP).
          Source de verite des factures : <strong>{providerLabel}</strong>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/admin/billing/aging"
          className="card p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h2 className="font-semibold">Aging report</h2>
              <p className="text-sm text-slate-500">Factures impayees par anciennete (0-30 / 31-60 / 61-90 / 90+ j)</p>
            </div>
          </div>
          <ExternalLink size={16} className="text-slate-400" />
        </Link>

        <Link
          href="/admin/billing/cashflow"
          className="card p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
              <Banknote size={20} />
            </div>
            <div>
              <h2 className="font-semibold">Cash flow</h2>
              <p className="text-sm text-slate-500">Encaissements attendus 30/60/90j + flux Qonto 30j</p>
            </div>
          </div>
          <ExternalLink size={16} className="text-slate-400" />
        </Link>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Database size={18} /> Etat du connecteur
        </h2>
        <Row label="Provider actif" value={providerLabel} />
        <Row
          label="Configuration"
          value={status.configured ? 'OK (credentials valides)' : 'Incomplet - reglez les cles dans Parametres'}
          ok={status.configured}
        />
        <Row label="Qonto configure" value={status.qontoConfigured ? 'Oui' : 'Non'} ok={status.qontoConfigured} />
        <Row
          label="Push auto des contrats"
          value={status.autoPushContracts ? 'Active' : 'Manuel uniquement'}
        />
        <Row
          label="Cron interne factures"
          value={status.disableInternalCron ? 'Desactive (recommande)' : 'Actif - risque de doublons'}
          ok={status.disableInternalCron || status.provider === 'none'}
        />
        <Row
          label="Sync auto Qonto"
          value={status.qontoSyncEnabled ? 'Active (toutes les heures)' : 'Desactive'}
        />
        <button onClick={load} className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1">
          <RefreshCw size={12} /> Rafraichir
        </button>
      </div>

      {status.qontoConfigured && (
        <div className="card p-6 space-y-3">
          <h2 className="font-semibold">Qonto - Synchronisation manuelle</h2>
          <p className="text-sm text-slate-500">
            Importe les transactions des 7 derniers jours et tente le rapprochement automatique avec les societes du CRM.
          </p>
          <button onClick={syncQonto} disabled={syncing} className="btn btn-primary">
            <RefreshCw size={14} className={'mr-1 ' + (syncing ? 'animate-spin' : '')} />
            {syncing ? 'Import en cours...' : 'Importer les transactions Qonto'}
          </button>
        </div>
      )}

    </div>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm border-b border-slate-100 dark:border-slate-700 pb-2 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="flex items-center gap-1 font-medium">
        {ok === true && <CheckCircle2 size={14} className="text-emerald-600" />}
        {ok === false && <AlertCircle size={14} className="text-red-500" />}
        {value}
      </span>
    </div>
  );
}
