'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, ExternalLink, Download } from 'lucide-react';
import { toast } from 'sonner';
import { portalApi } from '@/lib/portal-api';

interface Subprocessor {
  id: string;
  name: string;
  legalEntity: string | null;
  role: string;
  purpose: string;
  dataCategories: string[];
  hostingCountry: string | null;
  transfersOutsideEu: boolean;
  transferMechanism: string;
  dpaUrl: string | null;
  vendorSubprocessorListUrl: string | null;
  startedAt: string;
}

const ROLE_LABEL: Record<string, string> = {
  HOSTING: 'Hebergement',
  EMAIL: 'Email',
  BACKUP: 'Sauvegarde',
  EDR: 'EDR / Antivirus',
  AI: 'Intelligence artificielle',
  PAYMENT: 'Paiement / facturation',
  COMMUNICATION: 'Communication / VoIP',
  SIGNATURE: 'Signature electronique',
  MONITORING: 'Monitoring',
  OTHER: 'Autre',
};

const MECHANISM_LABEL: Record<string, string> = {
  ADEQUACY_DECISION: 'Decision adequation',
  SCC: 'SCC (clauses contractuelles types)',
  BCR: 'BCR (regles contraignantes)',
  DEROGATION: 'Derogation',
  NOT_APPLICABLE: 'N/A (donnees UE)',
};

export default function PortalSubprocessorsPage() {
  const [items, setItems] = useState<Subprocessor[] | null>(null);

  useEffect(() => {
    portalApi.get('/subprocessors')
      .then(setItems)
      .catch((err) => toast.error('Chargement sous-traitants : ' + err.message));
  }, []);

  if (!items) return <div className="text-slate-400">Chargement...</div>;

  const grouped: Record<string, Subprocessor[]> = {};
  for (const s of items) {
    if (!grouped[s.role]) grouped[s.role] = [];
    grouped[s.role].push(s);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <ShieldCheck size={24} className="text-mdo-600" />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Sous-traitants RGPD</h1>
      </div>
      <p className="text-sm text-slate-500">
        En application de l'article 28 du RGPD, voici la liste des sous-traitants utilises
        par MDO Services pour traiter les donnees personnelles dans le cadre de votre contrat.
        Cette liste alimente votre registre de sous-traitance.
      </p>

      {Object.entries(grouped).map(([role, list]) => (
        <div key={role} className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide pt-2">
            {ROLE_LABEL[role] ?? role}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {list.map((s) => (
              <div
                key={s.id}
                className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-2"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{s.name}</h3>
                    {s.legalEntity && (
                      <p className="text-xs text-slate-500">{s.legalEntity}</p>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">{s.purpose}</p>
                {s.dataCategories.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {s.dataCategories.map((d) => (
                      <span
                        key={d}
                        className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-xs text-slate-500 grid grid-cols-2 gap-x-3 gap-y-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                  {s.hostingCountry && <div><strong>Hebergement :</strong> {s.hostingCountry}</div>}
                  <div>
                    <strong>Hors UE :</strong>{' '}
                    {s.transfersOutsideEu ? 'Oui (' + (MECHANISM_LABEL[s.transferMechanism] ?? s.transferMechanism) + ')' : 'Non'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs pt-1">
                  {s.dpaUrl && (
                    <a
                      href={s.dpaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-mdo-600 hover:underline"
                    >
                      <Download size={12} /> DPA / Avenant
                    </a>
                  )}
                  {s.vendorSubprocessorListUrl && (
                    <a
                      href={s.vendorSubprocessorListUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-mdo-600 hover:underline"
                    >
                      <ExternalLink size={12} /> Sous-traitants du fournisseur
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs text-slate-400 pt-4 border-t border-slate-100 dark:border-slate-800">
        Pour toute question sur le traitement de vos donnees, contactez{' '}
        <a href="mailto:dpo@mdoservices.fr" className="text-mdo-600 hover:underline">
          dpo@mdoservices.fr
        </a>
      </p>
    </div>
  );
}
