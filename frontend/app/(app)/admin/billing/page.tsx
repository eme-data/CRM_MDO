'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Receipt, RefreshCw, Database, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';

interface BillingStatus {
  provider: string; // none / sellsy / qonto
  configured: boolean;
  autoPushContracts: boolean;
  disableInternalCron: boolean;
  sellsyConfigured: boolean;
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
    status.provider === 'sellsy' ? 'Sellsy'
    : status.provider === 'qonto' ? 'Qonto'
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
        <Row label="Sellsy configure" value={status.sellsyConfigured ? 'Oui' : 'Non'} ok={status.sellsyConfigured} />
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

      {status.sellsyConfigured && (
        <div className="card p-6 space-y-3">
          <h2 className="font-semibold">Sellsy - Webhook</h2>
          <p className="text-sm text-slate-500">
            Configurez ce webhook dans Sellsy &gt; Reglages &gt; Integrations pour recevoir les changements de statut facture.
          </p>
          <code className="block bg-slate-100 dark:bg-slate-800 p-3 rounded text-xs font-mono">
            POST https://crm.mdoservices.fr/api/billing/webhooks/sellsy
          </code>
          <p className="text-xs text-slate-500">
            Header attendu : <code>X-Sellsy-Signature</code> (HMAC SHA-256 avec le secret configure dans les parametres).
          </p>
          <a
            href="https://app.sellsy.com"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-sm text-mdo-600 hover:underline"
          >
            <ExternalLink size={14} /> Ouvrir Sellsy
          </a>
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
