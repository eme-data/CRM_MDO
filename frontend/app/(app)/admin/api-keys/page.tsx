'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2, Copy, Key } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatDate } from '@/lib/utils';

interface ApiKey {
  id: string;
  name: string;
  scope: string;
  prefix: string;
  company?: { id: string; name: string } | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  createdAt: string;
}

const SCOPE_LABEL: Record<string, string> = {
  GLOBAL_READ: 'Global - Lecture',
  GLOBAL_WRITE: 'Global - Lecture/Ecriture',
  CLIENT_READ: 'Client - Lecture',
  CLIENT_WRITE: 'Client - Lecture/Ecriture',
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [newKeyShown, setNewKeyShown] = useState<string | null>(null);
  const confirm = useConfirm();

  async function load() {
    setKeys(await api.get('/api-keys'));
  }

  useEffect(() => {
    load();
    api.get('/companies?pageSize=500').then((r) => setCompanies(r.items));
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const name = (f.elements.namedItem('name') as HTMLInputElement).value;
    const scope = (f.elements.namedItem('scope') as HTMLSelectElement).value;
    const companyId = (f.elements.namedItem('companyId') as HTMLSelectElement).value || undefined;
    const expiresAt = (f.elements.namedItem('expiresAt') as HTMLInputElement).value || undefined;
    try {
      const res = await api.post('/api-keys', { name, scope, companyId, expiresAt });
      setNewKeyShown(res.plaintextKey);
      setCreating(false);
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function revoke(k: ApiKey) {
    const ok = await confirm({
      title: 'Revoquer cette cle ?',
      message: 'La cle "' + k.name + '" sera revoquee immediatement. Toutes les requetes API seront refusees.',
      confirmLabel: 'Revoquer',
      tone: 'danger',
    });
    if (!ok) return;
    try { await api.delete('/api-keys/' + k.id); toast.success('Cle revoquee'); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  async function copyKey() {
    if (!newKeyShown) return;
    await navigator.clipboard.writeText(newKeyShown);
    toast.success('Cle copiee');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Key size={28} className="text-mdo-600" /> Cles API
        </h1>
        {!creating && !newKeyShown && (
          <button onClick={() => setCreating(true)} className="btn btn-primary">
            <Plus size={16} className="mr-1" /> Nouvelle cle
          </button>
        )}
      </div>

      {newKeyShown && (
        <div className="card p-6 border-2 border-amber-300 bg-amber-50 space-y-3">
          <div className="font-semibold text-amber-800">Cle generee — copiez-la maintenant</div>
          <p className="text-sm text-amber-700">
            Cette cle ne sera <strong>plus jamais affichee</strong>. Stockez-la dans votre gestionnaire de
            secrets et fournissez-la au client.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white p-3 rounded font-mono text-sm break-all">{newKeyShown}</code>
            <button onClick={copyKey} className="btn btn-primary"><Copy size={16} className="mr-1" /> Copier</button>
          </div>
          <button onClick={() => setNewKeyShown(null)} className="btn btn-secondary">J'ai bien copie la cle</button>
        </div>
      )}

      {creating && (
        <form onSubmit={submit} className="card p-6 space-y-4 border-mdo-200 bg-mdo-50">
          <h2 className="font-semibold">Creer une cle API</h2>
          <div><label className="label">Nom *</label>
            <input name="name" required className="input" placeholder="Zapier prod, n8n integration..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Scope *</label>
              <select name="scope" required className="input" defaultValue="CLIENT_READ">
                {Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label className="label">Societe (si scope CLIENT_*)</label>
              <select name="companyId" className="input">
                <option value="">--</option>
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="label">Expire le (optionnel)</label>
              <input name="expiresAt" type="date" className="input" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Generer la cle</button>
            <button type="button" onClick={() => setCreating(false)} className="btn btn-secondary">Annuler</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Nom</th>
              <th className="p-3 font-medium">Prefix</th>
              <th className="p-3 font-medium">Scope</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">Usage</th>
              <th className="p-3 font-medium">Derniere util.</th>
              <th className="p-3 font-medium">Expire</th>
              <th className="p-3 font-medium">Statut</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-slate-400">Aucune cle API. Creez-en une pour ouvrir l'API publique a un client ou une integration.</td></tr>
            ) : keys.map((k) => (
              <tr key={k.id} className="border-t hover:bg-slate-50">
                <td className="p-3 font-medium">{k.name}</td>
                <td className="p-3 font-mono text-xs">{k.prefix}...</td>
                <td className="p-3 text-xs">{SCOPE_LABEL[k.scope]}</td>
                <td className="p-3">
                  {k.company ? (
                    <Link href={'/companies/' + k.company.id} className="text-mdo-600 hover:underline">{k.company.name}</Link>
                  ) : '-'}
                </td>
                <td className="p-3 tabular-nums">{k.usageCount}</td>
                <td className="p-3 text-xs">{k.lastUsedAt ? formatDate(k.lastUsedAt) : 'jamais'}</td>
                <td className="p-3 text-xs">{k.expiresAt ? formatDate(k.expiresAt) : '-'}</td>
                <td className="p-3">
                  {k.revokedAt
                    ? <span className="badge bg-red-100 text-red-700">Revoquee</span>
                    : k.expiresAt && new Date(k.expiresAt) < new Date()
                      ? <span className="badge bg-slate-100 text-slate-500">Expiree</span>
                      : <span className="badge bg-emerald-100 text-emerald-700">Active</span>}
                </td>
                <td className="p-3">
                  {!k.revokedAt && (
                    <button onClick={() => revoke(k)} className="text-red-500 hover:text-red-700" title="Revoquer">
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4 bg-slate-50">
        <h3 className="font-semibold text-sm mb-2">Documentation API publique</h3>
        <p className="text-xs text-slate-600 mb-2">
          Authentification : <code className="bg-white px-1 py-0.5 rounded">Authorization: Bearer mdo_live_xxx</code>
        </p>
        <ul className="text-xs space-y-1 text-slate-600">
          <li><code className="bg-white px-1 py-0.5 rounded">GET /api/public/v1/me</code> — info sur la cle</li>
          <li><code className="bg-white px-1 py-0.5 rounded">GET /api/public/v1/contracts</code> — contrats accessibles</li>
          <li><code className="bg-white px-1 py-0.5 rounded">GET /api/public/v1/tickets</code> — tickets accessibles</li>
          <li><code className="bg-white px-1 py-0.5 rounded">GET /api/public/v1/invoices</code> — factures accessibles</li>
          <li><code className="bg-white px-1 py-0.5 rounded">GET /api/public/v1/assets</code> — assets accessibles</li>
          <li><code className="bg-white px-1 py-0.5 rounded">GET /api/public/v1/companies/:id</code> — info societe</li>
        </ul>
      </div>
    </div>
  );
}
