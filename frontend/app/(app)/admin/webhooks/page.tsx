'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Webhook, Plus, Trash2, RefreshCw, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useReloadOnFocus } from '@/lib/useReloadOnFocus';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatDateTime } from '@/lib/utils';

const ALL_EVENTS = [
  'TICKET_CREATED', 'TICKET_RESOLVED',
  'CONTRACT_SIGNED', 'CONTRACT_EXPIRING',
  'INVOICE_OVERDUE', 'INVOICE_PAID',
  'COMPANY_CREATED',
  'QUOTE_ACCEPTED', 'QUOTE_REJECTED',
  'BACKUP_FAILED',
];

export default function WebhooksPage() {
  const [items, setItems] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [showSecret, setShowSecret] = useState<{ id: string; secret: string; name: string } | null>(null);
  const confirm = useConfirm();

  async function load() { setItems(await api.get('/webhooks')); }
  useEffect(() => {
    load();
    api.get('/companies?pageSize=500').then((r) => setCompanies(r.items));
  }, []);
  useReloadOnFocus(load);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const events = ALL_EVENTS.filter((ev) =>
      (f.elements.namedItem(ev) as HTMLInputElement)?.checked,
    );
    if (events.length === 0) { toast.error('Selectionnez au moins 1 event'); return; }
    const payload = {
      url: (f.elements.namedItem('url') as HTMLInputElement).value,
      description: (f.elements.namedItem('description') as HTMLInputElement).value || undefined,
      companyId: (f.elements.namedItem('companyId') as HTMLSelectElement).value || undefined,
      events,
    };
    try {
      const w = await api.post('/webhooks', payload);
      setShowSecret({ id: w.id, secret: w.secret, name: w.url });
      setCreating(false);
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function regen(w: any) {
    const ok = await confirm({
      title: 'Regenerer le secret webhook ?',
      message: 'L\'ancien secret cessera immediatement de fonctionner. Vous devrez mettre a jour le receveur.',
      confirmLabel: 'Regenerer', tone: 'danger',
    });
    if (!ok) return;
    try {
      const r = await api.post('/webhooks/' + w.id + '/regenerate-secret');
      setShowSecret({ id: w.id, secret: r.secret, name: w.url });
    } catch (err: any) { toast.error(err.message); }
  }

  async function remove(w: any) {
    const ok = await confirm({ title: 'Supprimer ce webhook ?', confirmLabel: 'Supprimer', tone: 'danger' });
    if (!ok) return;
    try { await api.delete('/webhooks/' + w.id); toast.success('Supprime'); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  async function copySecret() {
    if (!showSecret) return;
    await navigator.clipboard.writeText(showSecret.secret);
    toast.success('Secret copie');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Webhook size={28} className="text-mdo-600" /> Webhooks sortants
        </h1>
        {!creating && !showSecret && (
          <button onClick={() => setCreating(true)} className="btn btn-primary"><Plus size={16} className="mr-1" /> Nouveau</button>
        )}
      </div>

      <p className="text-sm text-slate-500">
        Permet a une integration externe (Zapier, n8n, dashboard client custom)
        de recevoir les events CRM. Chaque POST contient un header
        <code className="bg-slate-100 px-1 mx-1 rounded">X-Webhook-Signature: sha256=...</code>
        a verifier cote receveur (HMAC du body avec le secret).
      </p>

      {showSecret && (
        <div className="card p-6 border-2 border-amber-300 bg-amber-50 space-y-3">
          <h3 className="font-semibold text-amber-800">Webhook cree — secret a copier maintenant</h3>
          <p className="text-sm text-amber-700">
            Ce secret ne sera <strong>plus jamais affiche</strong>. Configurez-le cote receveur
            pour valider la signature HMAC SHA-256.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white p-3 rounded font-mono text-sm break-all">{showSecret.secret}</code>
            <button onClick={copySecret} className="btn btn-primary"><Copy size={14} className="mr-1" /> Copier</button>
          </div>
          <button onClick={() => setShowSecret(null)} className="btn btn-secondary">J'ai copie</button>
        </div>
      )}

      {creating && (
        <form onSubmit={submit} className="card p-6 space-y-4 border-mdo-200 bg-mdo-50">
          <h2 className="font-semibold">Nouveau webhook</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">URL HTTPS *</label><input name="url" type="url" required className="input" placeholder="https://exemple.com/hook" /></div>
            <div className="col-span-2"><label className="label">Description</label><input name="description" className="input" placeholder="Zapier prod, n8n integration..." /></div>
            <div><label className="label">Societe (optionnel : scope client)</label>
              <select name="companyId" className="input">
                <option value="">Tous (scope global)</option>
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Events souscrits</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
              {ALL_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name={ev} />
                  <code>{ev}</code>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Creer</button>
            <button type="button" onClick={() => setCreating(false)} className="btn btn-secondary">Annuler</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">URL</th>
              <th className="p-3 font-medium">Scope</th>
              <th className="p-3 font-medium">Events</th>
              <th className="p-3 font-medium text-right">OK / Fail</th>
              <th className="p-3 font-medium">Dernier succes</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-slate-400">Aucun webhook configure.</td></tr>
            ) : items.map((w) => (
              <tr key={w.id} className={'border-t hover:bg-slate-50 ' + (!w.isActive ? 'opacity-50' : '')}>
                <td className="p-3 font-mono text-xs break-all max-w-md">{w.url}</td>
                <td className="p-3 text-xs">
                  {w.company ? <Link href={'/companies/' + w.company.id} className="text-mdo-600 hover:underline">{w.company.name}</Link> : <span className="text-slate-500">Global</span>}
                </td>
                <td className="p-3 text-xs"><div className="flex flex-wrap gap-1">{w.events.map((e: string) => <code key={e} className="bg-slate-100 px-1 rounded text-[10px]">{e}</code>)}</div></td>
                <td className="p-3 text-right text-xs">
                  <span className="text-emerald-600">{w.successCount}</span> / <span className="text-red-600">{w.failureCount}</span>
                </td>
                <td className="p-3 text-xs">{w.lastSuccessAt ? formatDateTime(w.lastSuccessAt) : 'jamais'}</td>
                <td className="p-3 text-right">
                  <button onClick={() => regen(w)} title="Regenerer secret" className="text-amber-600 hover:text-amber-700 mr-2"><RefreshCw size={14} /></button>
                  <button onClick={() => remove(w)} title="Supprimer" className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
