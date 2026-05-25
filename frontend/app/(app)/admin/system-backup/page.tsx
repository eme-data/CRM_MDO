'use client';
import { useEffect, useState } from 'react';
import { Database, Download, Trash2, AlertTriangle, RefreshCw, ShieldAlert, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatDateTime } from '@/lib/utils';

interface Backup {
  id: string;
  kind: string;
  status: string;
  filename: string;
  sizeBytes: string | number | null;
  includesDb: boolean;
  includesUploads: boolean;
  errorMessage: string | null;
  durationMs: number | null;
  restoredAt: string | null;
  restoredBy?: { firstName: string; lastName: string } | null;
  restoreError: string | null;
  downloadCount: number;
  createdAt: string;
  createdBy?: { firstName: string; lastName: string } | null;
}

const KIND_LABEL: Record<string, string> = {
  MANUAL: 'Manuel',
  SCHEDULED: 'Auto (cron)',
  PRE_RESTORE: 'Pre-restore (safety)',
};
const KIND_COLOR: Record<string, string> = {
  MANUAL: 'bg-mdo-100 text-mdo-700',
  SCHEDULED: 'bg-slate-100 text-slate-700',
  PRE_RESTORE: 'bg-amber-100 text-amber-800',
};
const STATUS_COLOR: Record<string, string> = {
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  RUNNING: 'bg-blue-100 text-blue-700',
  FAILED: 'bg-red-100 text-red-700',
};

function formatBytes(b: any): string {
  if (b == null) return '-';
  const n = typeof b === 'string' ? Number(b) : b;
  if (n < 1024) return n + ' B';
  if (n < 1024 ** 2) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1) + ' MB';
  return (n / 1024 ** 3).toFixed(2) + ' GB';
}

export default function SystemBackupPage() {
  const [items, setItems] = useState<Backup[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<Backup | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [restorePhrase, setRestorePhrase] = useState('');
  const [restoreInProgress, setRestoreInProgress] = useState(false);
  const confirm = useConfirm();

  async function load() {
    // allSettled : si /stats echoue (DB lente, BigInt KO), on conserve la
    // liste deja recue au lieu d'afficher une page vide sans toast.
    const [listR, statsR] = await Promise.allSettled([
      api.get('/system-backup'),
      api.get('/system-backup/stats'),
    ]);
    if (listR.status === 'fulfilled') setItems(listR.value);
    else toast.error('Liste backups indisponible : ' + (listR.reason?.message ?? 'erreur'));
    if (statsR.status === 'fulfilled') setStats(statsR.value);
  }
  useEffect(() => { load(); }, []);

  // Polling tant qu'un backup est en cours (RUNNING). Cron interne (02:30) ou
  // creation manuelle : le record passe par RUNNING avant COMPLETED/FAILED.
  // Sans polling, l'UI restait figee sur "RUNNING" jusqu'a reload manuel. On
  // sort de la boucle des qu'aucun RUNNING n'est present (clear immediat).
  useEffect(() => {
    const hasRunning = items.some((b) => b.status === 'RUNNING');
    if (!hasRunning) return;
    const id = setInterval(() => { load(); }, 3000);
    return () => clearInterval(id);
  }, [items]);

  async function createNow(includeUploads: boolean) {
    setCreating(true);
    try {
      const r = await api.post('/system-backup', { includeUploads });
      toast.success('Backup ' + r.filename + ' cree');
      load();
    } catch (err: any) { toast.error('Backup echoue : ' + err.message); }
    finally { setCreating(false); }
  }

  function downloadBackup(b: Backup) {
    const token = localStorage.getItem('crm_mdo_access_token');
    const link = document.createElement('a');
    link.href = '/api/system-backup/' + b.id + '/download';
    // Bearer impossible sur un <a> classique ; on utilise fetch + blob
    fetch(link.href, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = b.filename; a.click();
        URL.revokeObjectURL(url);
      })
      .catch((err) => toast.error('Telechargement echoue : ' + err.message));
  }

  async function remove(b: Backup) {
    const ok = await confirm({
      title: 'Supprimer ce backup ?',
      message: 'Le fichier .tar.gz sera definitivement supprime du disque.',
      confirmLabel: 'Supprimer', tone: 'danger',
    });
    if (!ok) return;
    try { await api.delete('/system-backup/' + b.id); toast.success('Supprime'); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  async function performRestore() {
    if (!restoring) return;
    if (restorePhrase !== 'JE CONFIRME LA RESTAURATION') {
      toast.error('Phrase de confirmation incorrecte');
      return;
    }
    if (!restorePassword) {
      toast.error('Mot de passe requis');
      return;
    }
    setRestoreInProgress(true);
    try {
      const r = await api.post('/system-backup/' + restoring.id + '/restore', {
        currentPassword: restorePassword,
        confirmPhrase: restorePhrase,
      });
      toast.success('Restauration terminee. Snapshot pre-restore : ' + r.preRestoreBackupId);
      setRestoring(null);
      setRestorePassword('');
      setRestorePhrase('');
      // Recharge immediate (le polling useEffect prendra le relais si un
      // PRE_RESTORE backup est encore en RUNNING au moment du retour).
      load();
    } catch (err: any) { toast.error('Restauration echouee : ' + err.message); }
    finally { setRestoreInProgress(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Database size={28} className="text-mdo-600" /> Backup &amp; restore systeme
        </h1>
        <div className="flex gap-2">
          <button onClick={() => createNow(false)} disabled={creating} className="btn btn-secondary">
            <Plus size={14} className="mr-1" /> Backup BDD seule
          </button>
          <button onClick={() => createNow(true)} disabled={creating} className="btn btn-primary">
            <Plus size={14} className="mr-1" /> {creating ? 'Creation...' : 'Backup complet (BDD + uploads)'}
          </button>
        </div>
      </div>

      <div className="card p-4 bg-amber-50 border-amber-200 text-sm">
        <p className="text-amber-800 font-semibold flex items-center gap-2">
          <ShieldAlert size={14} /> Le restore est une action destructive
        </p>
        <p className="text-amber-700 mt-1 text-xs">
          Toutes les donnees actuelles seront ecrasees par le contenu du backup choisi.
          Un snapshot PRE_RESTORE est cree automatiquement avant pour pouvoir rollback.
          Pour valider, taper exactement <code>JE CONFIRME LA RESTAURATION</code> + votre mot de passe.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card p-3"><p className="text-xs text-slate-500">Total backups</p><p className="text-2xl font-bold">{stats.totalBackups}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Taille totale</p><p className="text-2xl font-bold">{formatBytes(stats.totalSizeBytes)}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Dernier backup</p><p className="text-sm font-bold">{stats.lastBackupAt ? formatDateTime(stats.lastBackupAt) : 'jamais'}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Restores effectues</p><p className="text-2xl font-bold">{stats.restoredCount}</p></div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Fichier</th>
              <th className="p-3 font-medium">Taille</th>
              <th className="p-3 font-medium">Auteur</th>
              <th className="p-3 font-medium">Statut</th>
              <th className="p-3 font-medium">Restaure le</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-slate-400">Aucun backup. Creez-en un pour commencer.</td></tr>
            ) : items.map((b) => (
              <tr key={b.id} className="border-t hover:bg-slate-50">
                <td className="p-3 text-xs">{formatDateTime(b.createdAt)}</td>
                <td className="p-3"><span className={'badge ' + KIND_COLOR[b.kind]}>{KIND_LABEL[b.kind]}</span></td>
                <td className="p-3 font-mono text-[10px]">{b.filename}</td>
                <td className="p-3">{formatBytes(b.sizeBytes)}</td>
                <td className="p-3 text-xs">{b.createdBy ? b.createdBy.firstName + ' ' + b.createdBy.lastName : '-'}</td>
                <td className="p-3">
                  <span className={'badge ' + STATUS_COLOR[b.status] + (b.status === 'RUNNING' ? ' animate-pulse' : '')}>{b.status}</span>
                  {b.errorMessage && <div className="text-[10px] text-red-600 mt-1" title={b.errorMessage}>{b.errorMessage.slice(0, 40)}...</div>}
                </td>
                <td className="p-3 text-xs">
                  {b.restoredAt ? (
                    <span className="text-emerald-700">
                      {formatDateTime(b.restoredAt)}
                      {b.restoredBy && <div className="text-slate-400">par {b.restoredBy.firstName} {b.restoredBy.lastName}</div>}
                    </span>
                  ) : '-'}
                </td>
                <td className="p-3 text-right">
                  {b.status === 'COMPLETED' && (
                    <>
                      <button onClick={() => downloadBackup(b)} title="Telecharger" className="text-slate-500 hover:text-mdo-600 mr-2"><Download size={14} /></button>
                      <button onClick={() => setRestoring(b)} title="Restaurer" className="text-amber-600 hover:text-amber-800 mr-2"><RefreshCw size={14} /></button>
                    </>
                  )}
                  <button onClick={() => remove(b)} title="Supprimer" className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal restore */}
      {restoring && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle size={24} />
              <h2 className="text-xl font-bold">Restaurer depuis ce backup ?</h2>
            </div>
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm space-y-2">
              <p><strong>Backup :</strong> {restoring.filename}</p>
              <p><strong>Date :</strong> {formatDateTime(restoring.createdAt)}</p>
              <p><strong>Taille :</strong> {formatBytes(restoring.sizeBytes)}</p>
              <p><strong>Inclut :</strong> BDD{restoring.includesUploads && ' + Uploads'}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
              <p className="font-semibold text-amber-800">Consequences immediates :</p>
              <ul className="list-disc list-inside text-amber-700 text-xs mt-1 space-y-0.5">
                <li>Toutes les donnees actuelles (depuis ce backup) seront PERDUES</li>
                <li>Tous les utilisateurs seront deconnectes (sessions invalides)</li>
                <li>Un snapshot PRE_RESTORE est cree automatiquement (rollback possible)</li>
                <li>Les uploads/pieces jointes actuels seront ecrases</li>
                <li>Le restore prend typiquement 30s-5min selon la taille</li>
              </ul>
            </div>
            <div>
              <label className="label">Tapez exactement : <code className="bg-slate-100 px-1 rounded">JE CONFIRME LA RESTAURATION</code></label>
              <input className="input font-mono" value={restorePhrase} onChange={(e) => setRestorePhrase(e.target.value)} placeholder="JE CONFIRME LA RESTAURATION" />
            </div>
            <div>
              <label className="label">Votre mot de passe (validation forte)</label>
              <input type="password" className="input" value={restorePassword} onChange={(e) => setRestorePassword(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setRestoring(null); setRestorePassword(''); setRestorePhrase(''); }} className="btn btn-secondary" disabled={restoreInProgress}>Annuler</button>
              <button
                onClick={performRestore}
                disabled={restoreInProgress || restorePhrase !== 'JE CONFIRME LA RESTAURATION' || !restorePassword}
                className="btn btn-danger"
              >
                {restoreInProgress ? 'Restauration en cours...' : 'Restaurer maintenant'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
