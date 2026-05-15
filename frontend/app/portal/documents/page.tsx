'use client';
import { useEffect, useState } from 'react';
import { FolderOpen, Download, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { portalApi, getPortalSession } from '@/lib/portal-api';
import { formatDate } from '@/lib/utils';

interface PortalDocument {
  id: string;
  filename: string;
  title: string | null;
  description: string | null;
  category: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: string | null;
  uploadedAt: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  CONTRACT_SIGNED: 'Contrats signes',
  KYC: 'KYC / KBIS / RIB',
  LEGAL: 'Juridique',
  COMPLIANCE: 'Conformite',
  TECHNICAL: 'Technique',
  COMMUNICATION: 'Communication',
  OTHER: 'Autres',
};

function formatBytes(n: number): string {
  if (n < 1024) return n + ' o';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' Ko';
  return (n / 1024 / 1024).toFixed(1) + ' Mo';
}

export default function PortalDocumentsPage() {
  const [items, setItems] = useState<PortalDocument[] | null>(null);

  useEffect(() => {
    portalApi.get('/documents')
      .then(setItems)
      .catch((err) => toast.error('Chargement documents : ' + err.message));
  }, []);

  async function downloadDoc(d: PortalDocument) {
    try {
      const session = getPortalSession();
      const res = await fetch('/api/portal/documents/' + d.id + '/download', {
        headers: session ? { 'X-Portal-Session': session } : {},
      });
      if (!res.ok) throw new Error('Telechargement impossible');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = d.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) { toast.error(err.message); }
  }

  if (!items) return <div className="text-slate-400">Chargement...</div>;

  const grouped: Record<string, PortalDocument[]> = {};
  for (const d of items) {
    if (!grouped[d.category]) grouped[d.category] = [];
    grouped[d.category].push(d);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <FolderOpen size={24} className="text-mdo-600" />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Mes documents</h1>
      </div>
      <p className="text-sm text-slate-500">
        Documents partages avec vous par MDO Services : contrats signes, attestations,
        schemas techniques, etc.
      </p>

      {items.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-400">
          Aucun document partage pour l'instant.
          <p className="text-xs text-slate-400 mt-2">
            Si vous attendez un document, contactez l'equipe MDO via un ticket.
          </p>
        </div>
      ) : (
        Object.entries(grouped).map(([cat, list]) => (
          <div key={cat} className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide pt-2">
              {CATEGORY_LABEL[cat] ?? cat}
            </h2>
            <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {list.map((d) => {
                const expDays = d.expiresAt
                  ? Math.floor((new Date(d.expiresAt).getTime() - Date.now()) / 86400_000)
                  : null;
                return (
                  <div key={d.id} className="p-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{d.title ?? d.filename}</span>
                        {expDays != null && expDays < 0 && (
                          <span className="badge bg-red-100 text-red-700">
                            <AlertTriangle size={10} className="inline mr-1" />Expire
                          </span>
                        )}
                        {expDays != null && expDays >= 0 && expDays <= 30 && (
                          <span className="badge bg-amber-100 text-amber-700">Expire dans {expDays}j</span>
                        )}
                      </div>
                      {d.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{d.description}</p>
                      )}
                      <div className="text-xs text-slate-400 mt-0.5">
                        {d.filename} · {formatBytes(d.sizeBytes)} · partage le {formatDate(d.uploadedAt)}
                      </div>
                    </div>
                    <button
                      onClick={() => downloadDoc(d)}
                      className="inline-flex items-center gap-1 text-mdo-600 hover:text-mdo-700 text-sm shrink-0"
                    >
                      <Download size={14} /> Telecharger
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
