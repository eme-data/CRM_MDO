'use client';
import { useEffect, useState } from 'react';
import { Server, Shield, ShieldCheck, ShieldAlert } from 'lucide-react';
import { portalApi } from '@/lib/portal-api';
import { formatDate, daysUntil } from '@/lib/utils';

const TYPE_LABEL: Record<string, string> = {
  HARDWARE: 'Materiel',
  LICENSE: 'Licence',
  SOFTWARE: 'Logiciel',
  DOMAIN: 'Domaine',
  CERTIFICATE: 'Certificat',
  M365_LICENSE: 'Licence M365',
  OTHER: 'Autre',
};

export default function PortalAssetsPage() {
  const [items, setItems] = useState<any[] | null>(null);

  useEffect(() => {
    portalApi.get('/assets').then(setItems).catch(() => setItems([]));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mes assets surveilles</h1>
        <p className="text-sm text-slate-500 mt-1">
          Equipements, licences, domaines et certificats que nous surveillons pour vous.
        </p>
      </div>

      {items === null ? (
        <div className="text-slate-400">Chargement...</div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-10 text-center">
          <Server size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-600 dark:text-slate-300">Aucun asset</p>
          <p className="text-sm text-slate-500 mt-1">Contactez MDO Services pour ajouter votre infrastructure a la surveillance.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="p-3 font-medium">Nom</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">Identifiant</th>
                <th className="p-3 font-medium">Expire</th>
                <th className="p-3 font-medium">Surveillance</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const days = a.expiresAt ? daysUntil(a.expiresAt) : null;
                const expired = days !== null && days < 0;
                const expSoon = days !== null && days >= 0 && days <= 30;
                return (
                  <tr key={a.id} className="border-t border-slate-200 dark:border-slate-800">
                    <td className="p-3 font-medium">{a.name}</td>
                    <td className="p-3">{TYPE_LABEL[a.type] ?? a.type}</td>
                    <td className="p-3 font-mono text-xs text-slate-500">{a.identifier ?? '-'}</td>
                    <td className="p-3">
                      {a.expiresAt ? (
                        <div className="flex items-center gap-2">
                          {expired
                            ? <ShieldAlert size={14} className="text-red-500" />
                            : expSoon
                              ? <ShieldAlert size={14} className="text-amber-500" />
                              : <ShieldCheck size={14} className="text-emerald-500" />}
                          <span className={expired ? 'text-red-600 font-medium' : expSoon ? 'text-amber-600 font-medium' : ''}>
                            {formatDate(a.expiresAt)}
                          </span>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="p-3">
                      {a.monitoringEnabled
                        ? <span className="badge bg-emerald-100 text-emerald-700">Active</span>
                        : <span className="badge bg-slate-100 text-slate-500">Non surveille</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
