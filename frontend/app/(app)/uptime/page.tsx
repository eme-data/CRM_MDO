'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Activity, Plus, RefreshCw, CheckCircle2, XCircle, HelpCircle, Trash2, PlayCircle, Globe, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useConfirm } from '@/components/ui/ConfirmDialog';

interface Monitor {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  isPublic: boolean;
  intervalMinutes: number;
  expectedStatus: number;
  lastCheckedAt: string | null;
  lastStatus: 'UP' | 'DOWN' | null;
  lastHttpCode: number | null;
  lastResponseMs: number | null;
  lastError: string | null;
  consecutiveFailures: number;
  company: { id: string; name: string } | null;
}

interface Overview {
  counts: { total: number; up: number; down: number; unknown: number };
  monitors: Monitor[];
}

function StatusBadge({ status }: { status: Monitor['lastStatus'] }) {
  if (status === 'UP') return <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={14} /> UP</span>;
  if (status === 'DOWN') return <span className="inline-flex items-center gap-1 text-red-600 font-semibold"><XCircle size={14} /> DOWN</span>;
  return <span className="inline-flex items-center gap-1 text-slate-400"><HelpCircle size={14} /> -</span>;
}

export default function UptimePage() {
  const [data, setData] = useState<Overview | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<any>({ method: 'GET', expectedStatus: 200, intervalMinutes: 5, enabled: true });
  const [running, setRunning] = useState(false);
  const confirm = useConfirm();

  async function load() {
    try {
      setData(await api.get('/uptime/overview'));
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  useEffect(() => {
    load();
    api.get('/companies?pageSize=500')
      .then((r) => setCompanies(r.items))
      .catch((err) => toast.error('Chargement clients : ' + err.message));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/uptime', draft);
      toast.success('Monitor cree');
      setShowForm(false);
      setDraft({ method: 'GET', expectedStatus: 200, intervalMinutes: 5, enabled: true });
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function checkOne(id: string, name: string) {
    const t = toast.loading('Verification de ' + name + '...');
    try {
      const r = await api.post('/uptime/' + id + '/check');
      toast.dismiss(t);
      if (r.isUp) toast.success('UP - HTTP ' + r.httpCode + ' (' + r.responseMs + 'ms)');
      else toast.error('DOWN - ' + (r.error ?? 'erreur'));
      load();
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err.message);
    }
  }

  async function runAll() {
    setRunning(true);
    const t = toast.loading('Verification de tous les sites...');
    try {
      await api.post('/uptime/run-all');
      toast.dismiss(t);
      toast.success('Verification terminee');
      load();
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function remove(id: string, name: string) {
    const ok = await confirm({
      title: 'Supprimer ce monitor ?',
      message: `« ${name} » et tout son historique de checks seront supprimes definitivement.`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete('/uptime/' + id);
      toast.success('Monitor supprime');
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function toggleEnabled(m: Monitor) {
    try {
      await api.patch('/uptime/' + m.id, { enabled: !m.enabled });
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function togglePublic(m: Monitor) {
    try {
      await api.patch('/uptime/' + m.id, { isPublic: !m.isPublic });
      toast.success(m.isPublic ? 'Retire de la page status publique' : 'Publie sur /status');
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  function set(k: string, v: any) { setDraft((d: any) => ({ ...d, [k]: v })); }

  if (!data) return <div>Chargement...</div>;

  const c = data.counts;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="text-mdo-500" /> Uptime sites clients
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Verification HTTP/HTTPS automatique toutes les 5 minutes. Alerte (notif + email) apres 3 echecs consecutifs.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn btn-secondary">
            <RefreshCw size={16} className="mr-1" /> Rafraichir
          </button>
          <button onClick={runAll} className="btn btn-secondary" disabled={running}>
            <PlayCircle size={16} className="mr-1" /> Verifier tout
          </button>
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
            <Plus size={16} className="mr-1" /> Nouveau monitor
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-sm text-slate-500">Total</p>
          <p className="text-2xl font-bold">{c.total}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">UP</p>
          <p className="text-2xl font-bold text-emerald-600">{c.up}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">DOWN</p>
          <p className="text-2xl font-bold text-red-600">{c.down}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Pas encore verifies</p>
          <p className="text-2xl font-bold text-slate-400">{c.unknown}</p>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={submit} className="card p-6 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className="label">Nom *</label><input className="input" required onChange={(e) => set('name', e.target.value)} placeholder="Site vitrine ACME" /></div>
            <div className="md:col-span-2"><label className="label">URL *</label><input className="input" type="url" required onChange={(e) => set('url', e.target.value)} placeholder="https://www.acme.fr/" /></div>
            <div><label className="label">Client</label>
              <select className="input" onChange={(e) => set('companyId', e.target.value || undefined)}>
                <option value="">-- Aucun --</option>
                {companies.map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
              </select>
            </div>
            <div><label className="label">Methode</label>
              <select className="input" value={draft.method} onChange={(e) => set('method', e.target.value)}>
                <option value="GET">GET</option>
                <option value="HEAD">HEAD</option>
              </select>
            </div>
            <div><label className="label">Code HTTP attendu</label><input type="number" min="100" max="599" className="input" value={draft.expectedStatus} onChange={(e) => set('expectedStatus', Number(e.target.value))} /></div>
            <div><label className="label">Intervalle (min)</label>
              <select className="input" value={draft.intervalMinutes} onChange={(e) => set('intervalMinutes', Number(e.target.value))}>
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 heure</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Creer</button>
            <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Annuler</button>
          </div>
        </form>
      )}

      {/* Liste */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-700 text-left">
            <tr>
              <th className="p-3 font-medium">Site</th>
              <th className="p-3 font-medium">URL</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">Statut</th>
              <th className="p-3 font-medium">Latence</th>
              <th className="p-3 font-medium">Dernier check</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.monitors.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-slate-400">Aucun monitor configure.</td></tr>
            ) : data.monitors.map((m) => (
              <tr key={m.id} className={'border-t border-slate-200 dark:border-slate-700 ' + (m.lastStatus === 'DOWN' ? 'bg-red-50 dark:bg-red-900/20' : '')}>
                <td className="p-3">
                  <Link href={'/uptime/' + m.id} className="font-medium text-mdo-600 hover:underline">{m.name}</Link>
                  {!m.enabled && <span className="ml-2 badge bg-slate-100 text-slate-500">desactive</span>}
                  <p className="text-xs text-slate-400">interv. {m.intervalMinutes}min, attendu HTTP {m.expectedStatus}</p>
                </td>
                <td className="p-3 font-mono text-xs">
                  <a href={m.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{m.url}</a>
                </td>
                <td className="p-3">
                  {m.company ? (
                    <Link href={'/companies/' + m.company.id} className="text-mdo-600 hover:underline">{m.company.name}</Link>
                  ) : <span className="text-slate-400">-</span>}
                </td>
                <td className="p-3"><StatusBadge status={m.lastStatus} /></td>
                <td className="p-3 text-xs">
                  {m.lastResponseMs != null ? m.lastResponseMs + ' ms' : '-'}
                  {m.lastHttpCode != null && <p className="text-slate-400">HTTP {m.lastHttpCode}</p>}
                  {m.lastError && <p className="text-red-500" title={m.lastError}>{m.lastError.slice(0, 40)}{m.lastError.length > 40 ? '...' : ''}</p>}
                </td>
                <td className="p-3 text-xs text-slate-500">
                  {m.lastCheckedAt ? formatDate(m.lastCheckedAt) : 'jamais'}
                </td>
                <td className="p-3">
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => toggleEnabled(m)}
                      aria-label={m.enabled ? `Desactiver ${m.name}` : `Activer ${m.name}`}
                      className={m.enabled ? 'text-emerald-600' : 'text-slate-400'}
                      title={m.enabled ? 'Desactiver' : 'Activer'}
                    >
                      <Activity size={14} />
                    </button>
                    <button
                      onClick={() => togglePublic(m)}
                      aria-label={m.isPublic ? `Retirer ${m.name} de la page status publique` : `Publier ${m.name} sur la page status`}
                      className={m.isPublic ? 'text-blue-600' : 'text-slate-400'}
                      title={m.isPublic ? 'Visible sur /status (cliquer pour retirer)' : 'Prive (cliquer pour publier sur /status)'}
                    >
                      {m.isPublic ? <Globe size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button onClick={() => checkOne(m.id, m.name)} aria-label={`Verifier ${m.name}`} className="text-mdo-600 hover:text-mdo-700" title="Verifier maintenant">
                      <RefreshCw size={14} />
                    </button>
                    <button onClick={() => remove(m.id, m.name)} aria-label={`Supprimer ${m.name}`} className="text-red-500 hover:text-red-700" title="Supprimer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
