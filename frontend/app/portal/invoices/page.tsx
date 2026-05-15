'use client';
import { useEffect, useState } from 'react';
import { Receipt, Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { portalApi } from '@/lib/portal-api';
import { formatDate } from '@/lib/utils';

interface PortalInvoice {
  id: string;
  number: string;
  status: 'ISSUED' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  issueDate: string;
  dueDate: string;
  paidAt: string | null;
  totalHt: string;
  totalTtc: string;
  externalUrl: string | null;
  externalPdfUrl: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  ISSUED: 'Emise',
  PAID: 'Payee',
  OVERDUE: 'En retard',
  CANCELLED: 'Annulee',
};

const STATUS_COLOR: Record<string, string> = {
  ISSUED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  OVERDUE: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

export default function PortalInvoicesPage() {
  const [items, setItems] = useState<PortalInvoice[] | null>(null);

  useEffect(() => {
    portalApi.get('/invoices')
      .then(setItems)
      .catch((err) => toast.error('Chargement factures : ' + err.message));
  }, []);

  if (!items) return <div className="text-slate-400">Chargement...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Receipt size={24} className="text-mdo-600" />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Mes factures</h1>
      </div>
      <p className="text-sm text-slate-500">
        Vos factures emises par MDO Services. Le PDF officiel est gere par notre plateforme
        de facturation Qonto (clic sur "Telecharger").
      </p>
      {items.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-400">
          Aucune facture pour l'instant.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left">
              <tr>
                <th className="p-3 font-medium">Numero</th>
                <th className="p-3 font-medium">Date d'emission</th>
                <th className="p-3 font-medium">Echeance</th>
                <th className="p-3 font-medium">Statut</th>
                <th className="p-3 font-medium text-right">Total TTC</th>
                <th className="p-3 font-medium text-right">PDF</th>
              </tr>
            </thead>
            <tbody>
              {items.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-3 font-mono">{inv.number}</td>
                  <td className="p-3">{formatDate(inv.issueDate)}</td>
                  <td className="p-3">{formatDate(inv.dueDate)}</td>
                  <td className="p-3">
                    <span className={'badge ' + STATUS_COLOR[inv.status]}>{STATUS_LABEL[inv.status]}</span>
                  </td>
                  <td className="p-3 text-right font-medium tabular-nums">
                    {Number(inv.totalTtc).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                  </td>
                  <td className="p-3 text-right">
                    {inv.externalPdfUrl ? (
                      <a
                        href={inv.externalPdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-mdo-600 hover:underline"
                      >
                        <Download size={14} /> Telecharger
                      </a>
                    ) : inv.externalUrl ? (
                      <a
                        href={inv.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-mdo-600 hover:underline"
                      >
                        <ExternalLink size={14} /> Voir
                      </a>
                    ) : (
                      <span className="text-slate-400 text-xs">indisponible</span>
                    )}
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
