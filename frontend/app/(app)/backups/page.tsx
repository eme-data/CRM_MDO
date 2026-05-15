'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HardDrive, Plus, AlertTriangle, CheckCircle2, X, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

interface Job {
  id: string;
  name: string;
  vendor: string | null;
  sourceType: string;
  expectedFrequencyHours: number;
  isActive: boolean;
  lastRunStatus: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  company: { id: string; name: string };
}

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: 'bg-emerald-100 text-emerald-700',
  WARNING: 'bg-amber-100 text-amber-700',
  FAILED: 'bg-red-100 text-red-700',
  RUNNING: 'bg-blue-100 text-blue-700',
  SKIPPED: 'bg-slate-100 text-slate-500',
};

function formatBytes(b: number | bigint | string | null) {
  if (b == null) return '-';
  const n = typeof b === 'bigint' ? Number(b) : typeof b === 'string' ? Number(b) : b;
  if (n < 1024) return n + ' B';
  if (n < 1024 ** 2) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1) + ' MB';
  return (n / 1024 ** 3).toFixed(2) + ' GB';
}

function isOverdue(j: Job): boolean {
  if (!j.lastSuccessAt) return true;
  const ms = Date.now() - new Date(j.lastSuccessAt).getTime();
  return ms > j.expectedFrequencyHours * 3600_000;
}

export default function BackupsPage() {
  const [items, setItems] = useState<Job[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [companies, setCompanies] = useState<any[]>([]);
  const [createdSecret, setCreatedSecret] = useState<{ jobId: string; secret: string; jobName: string } | null>(null);

  async function load() {
    const [list, st] = await Promise.all([
      api.get('/backup-jobs'),
      api.get('/backup-jobs/stats'),
    ]);
    setItems(list); setStats(st);
  }
  useEffect(() => {
    load();
    api.get('/companies?pageSize=500').then((r) => setCompanies(r.items));
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const payload = {
      name: (f.elements.namedItem('name') as HTMLInputElement).value,
      companyId: (f.elements.namedItem('companyId') as HTMLSelectElement).value,
      vendor: (f.elements.namedItem('vendor') as HTMLInputElement).value || undefined,
      sourceType: (f.elements.namedItem('sourceType') as HTMLSelectElement).value,
      expectedFrequencyHours: parseInt((f.elements.namedItem('expectedFrequencyHours') as HTMLInputElement).value),
    };
    try {
      const j = await api.post('/backup-jobs', payload);
      setCreatedSecret({ jobId: j.id, secret: j.plaintextSecret, jobName: j.name });
      setCreating(false);
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function copySecret() {
    if (!createdSecret) return;
    await navigator.clipboard.writeText(createdSecret.secret);
    toast.success('Secret copie');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <HardDrive size={28} className="text-mdo-600" /> Backup verification
        </h1>
        {!creating && !createdSecret && (
          <button onClick={() => setCreating(true)} className="btn btn-primary"><Plus size={16} className="mr-1" /> Nouveau job</button>
        )}
      </div>

      {createdSecret && (
        <div className="card p-6 border-2 border-amber-300 bg-amber-50 space-y-3">
          <div className="font-semibold text-amber-800">Job "{createdSecret.jobName}" cree — secret webhook a copier maintenant</div>
          <p className="text-sm text-amber-700">
            Ce secret ne sera <strong>plus jamais affiche</strong>. Configurez-le dans
            votre script Veeam/Acronis pour POSTER les rapports d'execution :
          </p>
          <pre className="bg-white p-3 rounded text-xs overflow-x-auto">
{`POST /api/backup-jobs/${createdSecret.jobId}/runs
X-Backup-Secret: ${createdSecret.secret}
Content-Type: application/json

{
  "status": "SUCCESS",
  "startedAt": "2026-05-15T03:00:00Z",
  "endedAt": "2026-05-15T03:42:00Z",
  "durationSec": 2520,
  "sizeBytes": 12345678901,
  "itemsCount": 248,
  "externalRunId": "run-2026-05-15"
}`}
          </pre>
          <div className="flex gap-2">
            <button onClick={copySecret} className="btn btn-primary"><Copy size={14} className="mr-1" /> Copier le secret</button>
            <button onClick={() => setCreatedSecret(null)} className="btn btn-secondary">J'ai bien copie</button>
          </div>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="card p-3"><p className="text-xs text-slate-500">Jobs actifs</p><p className="text-2xl font-bold">{stats.total}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500 flex items-center gap-1"><CheckCircle2 size={11} /> Succes</p><p className="text-2xl font-bold text-emerald-600">{stats.success}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Echecs</p><p className="text-2xl font-bold text-red-600">{stats.failed}</p></div>
          <div className="card p-3 border-amber-200 bg-amber-50/50"><p className="text-xs text-slate-500 flex items-center gap-1"><AlertTriangle size={11} /> En retard</p><p className="text-2xl font-bold text-amber-700">{stats.overdue}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Jamais succede</p><p className="text-2xl font-bold text-red-700">{stats.neverSucceeded}</p></div>
        </div>
      )}

      {creating && (
        <form onSubmit={submit} className="card p-6 space-y-3 border-mdo-200 bg-mdo-50">
          <h2 className="font-semibold">Nouveau job backup</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Nom *</label><input name="name" required className="input" placeholder="Veeam VBO M365 PME, Acronis SVR-PAIE..." /></div>
            <div><label className="label">Societe *</label>
              <select name="companyId" required className="input">
                <option value="">--</option>
                {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="label">Vendor</label><input name="vendor" className="input" placeholder="Veeam, Acronis, Datto..." /></div>
            <div><label className="label">Type source</label>
              <select name="sourceType" className="input" defaultValue="OTHER">
                <option value="M365">M365</option>
                <option value="VM">VM</option>
                <option value="FILES">Fichiers/serveurs</option>
                <option value="DATABASE">Database</option>
                <option value="ENDPOINT">Endpoints</option>
                <option value="OTHER">Autre</option>
              </select>
            </div>
            <div><label className="label">Frequence attendue (h)</label>
              <input name="expectedFrequencyHours" type="number" min={1} className="input" defaultValue={26} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">Creer + generer secret webhook</button>
            <button type="button" onClick={() => setCreating(false)} className="btn btn-secondary">Annuler</button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Job</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">Type</th>
              <th className="p-3 font-medium">Dernier run</th>
              <th className="p-3 font-medium">Dernier SUCCESS</th>
              <th className="p-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-slate-400">Aucun job. Declarez vos backups Veeam/Acronis/Datto pour les surveiller.</td></tr>
            ) : items.map((j) => {
              const overdue = isOverdue(j);
              return (
                <tr key={j.id} className={'border-t hover:bg-slate-50 ' + (overdue ? 'bg-amber-50/30' : '')}>
                  <td className="p-3">
                    <Link href={'/backups/' + j.id} className="text-mdo-600 hover:underline font-medium">{j.name}</Link>
                    {j.vendor && <div className="text-xs text-slate-400">{j.vendor}</div>}
                  </td>
                  <td className="p-3 text-xs"><Link href={'/companies/' + j.company.id} className="text-mdo-600 hover:underline">{j.company.name}</Link></td>
                  <td className="p-3 text-xs">{j.sourceType}</td>
                  <td className="p-3 text-xs">{j.lastRunAt ? formatDateTime(j.lastRunAt) : 'jamais'}</td>
                  <td className="p-3 text-xs">{j.lastSuccessAt ? formatDateTime(j.lastSuccessAt) : <span className="text-red-600">jamais</span>}</td>
                  <td className="p-3">
                    {overdue ? (
                      <span className="badge bg-amber-100 text-amber-700 inline-flex items-center gap-1"><AlertTriangle size={11} /> EN RETARD</span>
                    ) : j.lastRunStatus ? (
                      <span className={'badge ' + STATUS_COLOR[j.lastRunStatus]}>{j.lastRunStatus}</span>
                    ) : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
