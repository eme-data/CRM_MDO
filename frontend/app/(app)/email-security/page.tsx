'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface Check {
  id: string;
  domain: string;
  spfRecord: string | null;
  spfPolicy: string | null;
  dmarcRecord: string | null;
  dmarcPolicy: string | null;
  dmarcRua: string | null;
  dkimSelector: string | null;
  dkimPresent: boolean;
  scorePct: number;
  error: string | null;
  lastCheckedAt: string;
  company: { id: string; name: string } | null;
}

function scoreColor(pct: number) {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-red-600';
}

export default function EmailSecurityPage() {
  const [items, setItems] = useState<Check[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [domain, setDomain] = useState('');

  async function load() {
    const [list, st] = await Promise.all([
      api.get('/email-security'),
      api.get('/email-security/stats'),
    ]);
    setItems(list); setStats(st);
  }
  useEffect(() => { load(); }, []);

  async function check() {
    if (!domain) return;
    try {
      await api.post('/email-security/check', { domain });
      toast.success('Verification effectuee');
      setDomain('');
      load();
    } catch (err: any) { toast.error(err.message); }
  }

  async function recheck(d: string) {
    try { await api.post('/email-security/check', { domain: d }); toast.success('Re-verifie'); load(); }
    catch (err: any) { toast.error(err.message); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Mail size={28} className="text-mdo-600" /> Email security (SPF / DMARC / DKIM)
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Score de configuration email par domaine client. Cron quotidien
          re-verifie tous les domaines (Asset type=DOMAIN actifs).
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="card p-3"><p className="text-xs text-slate-500">Domaines</p><p className="text-2xl font-bold">{stats.total}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Score moyen</p><p className={'text-2xl font-bold ' + scoreColor(stats.avgScore)}>{stats.avgScore}%</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Solides (≥80)</p><p className="text-2xl font-bold text-emerald-600">{stats.strongDomains}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">Faibles (&lt;50)</p><p className="text-2xl font-bold text-red-600">{stats.weakDomains}</p></div>
          <div className="card p-3"><p className="text-xs text-slate-500">DMARC enforced</p><p className="text-2xl font-bold">{stats.dmarcEnforced}</p></div>
        </div>
      )}

      <div className="card p-4 flex items-center gap-3">
        <input className="input flex-1" placeholder="Verifier un domaine (ex: mdoservices.fr)" value={domain} onChange={(e) => setDomain(e.target.value)} />
        <button onClick={check} className="btn btn-primary">Verifier</button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3 font-medium">Domaine</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium text-center">SPF</th>
              <th className="p-3 font-medium text-center">DMARC</th>
              <th className="p-3 font-medium text-center">DKIM</th>
              <th className="p-3 font-medium text-right">Score</th>
              <th className="p-3 font-medium">Verifie</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={8} className="p-6 text-center text-slate-400">Aucun domaine verifie. Ajoutez vos domaines clients comme Asset type=DOMAIN, ou verifiez-en un manuellement ci-dessus.</td></tr>
            ) : items.map((c) => (
              <tr key={c.id} className="border-t hover:bg-slate-50 align-top">
                <td className="p-3 font-mono text-xs">{c.domain}</td>
                <td className="p-3 text-xs">{c.company ? <Link href={'/companies/' + c.company.id} className="text-mdo-600 hover:underline">{c.company.name}</Link> : '-'}</td>
                <td className="p-3 text-center text-xs">
                  {c.spfRecord ? (
                    <span className={'badge ' + (c.spfPolicy === 'pass' ? 'bg-emerald-100 text-emerald-700' : c.spfPolicy === 'softfail' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')}>
                      {c.spfPolicy ?? 'OK'}
                    </span>
                  ) : <span className="badge bg-red-100 text-red-700">Absent</span>}
                </td>
                <td className="p-3 text-center text-xs">
                  {c.dmarcRecord ? (
                    <span className={'badge ' + (c.dmarcPolicy === 'reject' ? 'bg-emerald-100 text-emerald-700' : c.dmarcPolicy === 'quarantine' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')}>
                      p={c.dmarcPolicy ?? '?'}
                    </span>
                  ) : <span className="badge bg-red-100 text-red-700">Absent</span>}
                </td>
                <td className="p-3 text-center text-xs">
                  {c.dkimPresent ? (
                    <span className="badge bg-emerald-100 text-emerald-700">{c.dkimSelector}</span>
                  ) : <span className="badge bg-amber-100 text-amber-700">Non detecte</span>}
                </td>
                <td className="p-3 text-right">
                  <span className={'text-xl font-bold ' + scoreColor(c.scorePct)}>{c.scorePct}</span>
                </td>
                <td className="p-3 text-xs text-slate-500">{formatDate(c.lastCheckedAt)}</td>
                <td className="p-3">
                  <button onClick={() => recheck(c.domain)} className="text-slate-500 hover:text-mdo-600" title="Re-verifier"><RefreshCw size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
