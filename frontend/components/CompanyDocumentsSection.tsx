'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  FolderOpen, Upload, Download, Trash2, Edit, Check, X, AlertTriangle, Eye, EyeOff,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatDate } from '@/lib/utils';

interface CompanyDocument {
  id: string;
  filename: string;
  title: string | null;
  description: string | null;
  category: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: string | null;
  visibleToClient: boolean;
  uploadedAt: string;
  uploadedBy: { id: string; firstName: string; lastName: string } | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  CONTRACT_SIGNED: 'Contrat signe',
  KYC: 'KYC / KBIS / RIB',
  LEGAL: 'Juridique',
  COMPLIANCE: 'Conformite',
  TECHNICAL: 'Technique',
  COMMUNICATION: 'Communication',
  OTHER: 'Autre',
};

const CATEGORIES = Object.keys(CATEGORY_LABEL);

function formatBytes(n: number): string {
  if (n < 1024) return n + ' o';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' Ko';
  return (n / 1024 / 1024).toFixed(1) + ' Mo';
}

function expiryBadge(expiresAt: string | null) {
  if (!expiresAt) return null;
  const days = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86400_000);
  if (days < 0) {
    return <span className="badge bg-red-100 text-red-700"><AlertTriangle size={10} className="inline mr-1" />Expire</span>;
  }
  if (days <= 30) {
    return <span className="badge bg-amber-100 text-amber-700">Expire dans {days}j</span>;
  }
  return <span className="text-xs text-slate-400">Exp. {formatDate(expiresAt)}</span>;
}

export function CompanyDocumentsSection({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<CompanyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [extractResult, setExtractResult] = useState<{
    docId: string;
    docName: string;
    extracted: any;
    suggestedCompanyUpdate: Record<string, any> | null;
    error?: string;
  } | null>(null);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [draft, setDraft] = useState<{
    file: File | null;
    category: string;
    title: string;
    description: string;
    expiresAt: string;
    visibleToClient: boolean;
  }>({ file: null, category: 'OTHER', title: '', description: '', expiresAt: '', visibleToClient: false });
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    try {
      setItems(await api.get('/documents?companyId=' + companyId));
    } catch (err: any) {
      toast.error('Chargement documents : ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [companyId]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', draft.file);
      fd.append('companyId', companyId);
      fd.append('category', draft.category);
      if (draft.title) fd.append('title', draft.title);
      if (draft.description) fd.append('description', draft.description);
      if (draft.expiresAt) fd.append('expiresAt', new Date(draft.expiresAt).toISOString());
      fd.append('visibleToClient', draft.visibleToClient ? 'true' : 'false');
      const token = localStorage.getItem('crm_mdo_access_token');
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? 'Upload echoue');
      }
      toast.success('Document ajoute');
      setShowUpload(false);
      setDraft({ file: null, category: 'OTHER', title: '', description: '', expiresAt: '', visibleToClient: false });
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(d: CompanyDocument) {
    const ok = await confirm({
      title: 'Supprimer ce document ?',
      message: `« ${d.title ?? d.filename} » sera supprime definitivement.`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete('/documents/' + d.id);
      toast.success('Document supprime');
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function toggleVisibility(d: CompanyDocument) {
    try {
      await api.patch('/documents/' + d.id, { visibleToClient: !d.visibleToClient });
      toast.success(d.visibleToClient
        ? 'Retire du portail client'
        : 'Visible dans le portail client');
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function extractDoc(d: CompanyDocument) {
    setExtracting(d.id);
    try {
      const r = await api.post('/ai/extract/document/' + d.id);
      if (r.error === 'wrong_document_type') {
        toast.error('Le document ne correspond pas a la categorie ' + d.category);
        return;
      }
      if (r.error) {
        toast.error('Extraction : ' + r.error);
        return;
      }
      setExtractResult({
        docId: d.id,
        docName: d.title ?? d.filename,
        extracted: r.extracted,
        suggestedCompanyUpdate: r.suggestedCompanyUpdate,
      });
    } catch (err: any) { toast.error(err.message); }
    finally { setExtracting(null); }
  }

  async function applyCompanyUpdate() {
    if (!extractResult?.suggestedCompanyUpdate) return;
    setApplyingUpdate(true);
    try {
      await api.patch('/companies/' + companyId, extractResult.suggestedCompanyUpdate);
      toast.success('Fiche societe mise a jour depuis le document');
      setExtractResult(null);
      // Pas de load() ici : la modif est sur la societe parent, pas sur les
      // documents. Le parent route refetch automatiquement au focus (cf
      // useReloadOnFocus) — on force juste un router.refresh equivalent
      // en demandant au caller de refresh.
      window.location.reload();
    } catch (err: any) { toast.error(err.message); }
    finally { setApplyingUpdate(false); }
  }

  async function downloadDoc(d: CompanyDocument) {
    try {
      const token = localStorage.getItem('crm_mdo_access_token');
      const res = await fetch('/api/documents/' + d.id + '/download', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!res.ok) throw new Error('Telechargement echoue');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = d.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) { toast.error(err.message); }
  }

  // Groupement par categorie
  const grouped: Record<string, CompanyDocument[]> = {};
  for (const d of items) {
    if (!grouped[d.category]) grouped[d.category] = [];
    grouped[d.category].push(d);
  }

  return (
    <div id="documents" className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FolderOpen size={18} className="text-mdo-600" /> Documents GED
          <span className="text-sm font-normal text-slate-500">({items.length})</span>
        </h2>
        <button onClick={() => setShowUpload(!showUpload)} className="btn btn-primary text-sm">
          <Upload size={14} className="mr-1" /> Ajouter un document
        </button>
      </div>

      {showUpload && (
        <form onSubmit={handleUpload} className="border border-slate-200 dark:border-slate-700 rounded p-4 space-y-3 bg-slate-50 dark:bg-slate-800">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="label">Fichier *</label>
              <input
                type="file"
                required
                onChange={(e) => setDraft({ ...draft, file: e.target.files?.[0] ?? null })}
                className="input"
              />
              <p className="text-xs text-slate-500 mt-1">Max 50 Mo. PDF, Word, Excel, images, ZIP acceptes.</p>
            </div>
            <div>
              <label className="label">Categorie</label>
              <select className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date d'expiration (KBIS, attestation...)</label>
              <input type="date" className="input" value={draft.expiresAt} onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Titre (optionnel)</label>
              <input className="input" placeholder="ex: KBIS Mai 2026" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Description (optionnel)</label>
              <textarea className="input" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="visibleToClient"
                checked={draft.visibleToClient}
                onChange={(e) => setDraft({ ...draft, visibleToClient: e.target.checked })}
              />
              <label htmlFor="visibleToClient" className="text-sm">
                Visible par le client dans son portail (defaut : non)
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={uploading} className="btn btn-primary">
              {uploading ? 'Envoi...' : 'Uploader'}
            </button>
            <button type="button" onClick={() => setShowUpload(false)} className="btn btn-secondary">
              Annuler
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Chargement...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">
          Aucun document pour cette societe. Ajoutez le KBIS, le RIB, les contrats signes...
        </p>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat}>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {CATEGORY_LABEL[cat] ?? cat} ({list.length})
              </h3>
              <div className="space-y-1">
                {list.map((d) => (
                  <DocRow
                    key={d.id}
                    d={d}
                    extracting={extracting === d.id}
                    onDownload={() => downloadDoc(d)}
                    onExtract={() => extractDoc(d)}
                    onDelete={() => handleDelete(d)}
                    onToggleVisibility={() => toggleVisibility(d)}
                    isEditing={editing === d.id}
                    onEditStart={() => setEditing(d.id)}
                    onEditCancel={() => setEditing(null)}
                    onEditSaved={() => { setEditing(null); load(); }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {extractResult && (
        <ExtractModal
          result={extractResult}
          applying={applyingUpdate}
          onApply={applyCompanyUpdate}
          onClose={() => setExtractResult(null)}
        />
      )}
    </div>
  );
}

function ExtractModal({
  result, applying, onApply, onClose,
}: {
  result: {
    docId: string;
    docName: string;
    extracted: any;
    suggestedCompanyUpdate: Record<string, any> | null;
  };
  applying: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Sparkles size={16} className="text-purple-600" /> Extraction IA — {result.docName}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Donnees extraites</h4>
            <pre className="text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(result.extracted, null, 2)}
            </pre>
          </div>

          {result.suggestedCompanyUpdate && (
            <div className="border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 rounded p-3 space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2 text-emerald-800">
                <Check size={14} /> Mise a jour suggeree pour la fiche societe
              </h4>
              <ul className="text-sm space-y-1">
                {Object.entries(result.suggestedCompanyUpdate).map(([k, v]) => (
                  <li key={k} className="flex gap-2">
                    <span className="font-mono text-emerald-700">{k}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-medium">{String(v)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button
                  onClick={onApply}
                  disabled={applying}
                  className="btn btn-primary text-sm"
                >
                  {applying ? 'Application...' : 'Appliquer ces valeurs'}
                </button>
                <button onClick={onClose} className="btn btn-secondary text-sm">
                  Annuler
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Verifiez les valeurs avant d'appliquer. Les champs vides seront
                ignores. Vous pourrez toujours editer manuellement la fiche.
              </p>
            </div>
          )}

          {!result.suggestedCompanyUpdate && (
            <p className="text-xs text-slate-500 italic">
              Aucune mise a jour suggeree pour la fiche societe (le document n'est
              pas un KBIS, ou les champs extraits ne correspondent pas a des
              colonnes de la fiche).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DocRow({
  d, extracting, onDownload, onExtract, onDelete, onToggleVisibility,
  isEditing, onEditStart, onEditCancel, onEditSaved,
}: {
  d: CompanyDocument;
  extracting: boolean;
  onDownload: () => void;
  onExtract: () => void;
  onDelete: () => void;
  onToggleVisibility: () => void;
  isEditing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditSaved: () => void;
}) {
  const [title, setTitle] = useState(d.title ?? '');
  const [expiresAt, setExpiresAt] = useState(d.expiresAt ? d.expiresAt.slice(0, 10) : '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.patch('/documents/' + d.id, {
        title: title || null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      toast.success('Document mis a jour');
      onEditSaved();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  }

  if (isEditing) {
    return (
      <div className="border border-slate-200 dark:border-slate-700 rounded p-3 bg-slate-50 dark:bg-slate-800 space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input className="input" placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input type="date" className="input" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="btn btn-primary text-xs">
            <Check size={12} className="mr-1" /> {saving ? '...' : 'Enregistrer'}
          </button>
          <button onClick={onEditCancel} className="btn btn-secondary text-xs">
            <X size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded p-2 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{d.title ?? d.filename}</span>
          {d.visibleToClient && (
            <span className="badge bg-blue-100 text-blue-700" title="Visible dans le portail client">
              <Eye size={10} className="inline mr-1" />Client
            </span>
          )}
          {expiryBadge(d.expiresAt)}
        </div>
        <div className="text-xs text-slate-400 truncate">
          {d.filename} · {formatBytes(d.sizeBytes)} · ajoute le {formatDate(d.uploadedAt)}
          {d.uploadedBy && ' par ' + d.uploadedBy.firstName + ' ' + d.uploadedBy.lastName}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onDownload} title="Telecharger" className="text-slate-500 hover:text-mdo-600 p-1">
          <Download size={14} />
        </button>
        {/* Extraction IA : seulement sur les categories pour lesquelles on a un
            schema dedie (KYC pour KBIS/RIB, COMPLIANCE pour attestations,
            CONTRACT_SIGNED pour contrats, LEGAL pour mandats). Pour les autres
            categories l'extraction reste possible mais avec un schema generique. */}
        <button
          onClick={onExtract}
          disabled={extracting}
          title="Extraire les infos avec l'IA (Claude Vision)"
          className="text-purple-500 hover:text-purple-700 p-1 disabled:opacity-50"
        >
          <Sparkles size={14} className={extracting ? 'animate-pulse' : ''} />
        </button>
        <button
          onClick={onToggleVisibility}
          title={d.visibleToClient ? 'Retirer du portail client' : 'Publier sur le portail client'}
          className={(d.visibleToClient ? 'text-blue-600' : 'text-slate-400') + ' hover:text-blue-700 p-1'}
        >
          {d.visibleToClient ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button onClick={onEditStart} title="Editer" className="text-slate-500 hover:text-mdo-600 p-1">
          <Edit size={14} />
        </button>
        <button onClick={onDelete} title="Supprimer" className="text-red-500 hover:text-red-700 p-1">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
