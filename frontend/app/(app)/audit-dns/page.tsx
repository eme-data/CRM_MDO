'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ShieldCheck, ShieldAlert, AlertTriangle, Search, Mail, Server, Lock } from 'lucide-react';
import { api } from '@/lib/api';

interface AuditReport {
  domain: string;
  checkedAt: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  mx: { ok: boolean; records: Array<{ exchange: string; priority: number }>; error?: string };
  spf: {
    ok: boolean;
    raw: string | null;
    allQualifier: '+' | '-' | '~' | '?' | null;
    includes: string[];
    problems: string[];
    error?: string;
  };
  dmarc: {
    ok: boolean;
    raw: string | null;
    policy: 'none' | 'quarantine' | 'reject' | null;
    subdomainPolicy: string | null;
    pct: number | null;
    rua: string | null;
    ruf: string | null;
    problems: string[];
    error?: string;
  };
  summary: string[];
}

function gradeColor(grade: string) {
  switch (grade) {
    case 'A': return 'bg-emerald-500 text-white';
    case 'B': return 'bg-lime-500 text-white';
    case 'C': return 'bg-amber-500 text-white';
    case 'D': return 'bg-orange-500 text-white';
    default: return 'bg-red-600 text-white';
  }
}

function CheckBlock({
  title,
  ok,
  icon: Icon,
  children,
}: {
  title: string;
  ok: boolean;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <div className={'card p-5 border-l-4 ' + (ok ? 'border-emerald-500' : 'border-red-500')}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={20} className={ok ? 'text-emerald-500' : 'text-red-500'} />
        <h3 className="font-semibold">{title}</h3>
        {ok ? (
          <ShieldCheck size={16} className="text-emerald-500 ml-auto" />
        ) : (
          <ShieldAlert size={16} className="text-red-500 ml-auto" />
        )}
      </div>
      <div className="text-sm space-y-2">{children}</div>
    </div>
  );
}

function AuditDnsInner() {
  const searchParams = useSearchParams();
  const initialDomain = searchParams.get('domain') ?? '';
  const [domain, setDomain] = useState(initialDomain);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AuditReport | null>(null);

  async function run(d: string) {
    if (!d.trim()) return;
    setLoading(true);
    setReport(null);
    try {
      const r = await api.post('/monitoring/dns-audit', { domain: d.trim() });
      setReport(r);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Auto-run si on arrive avec ?domain=
  useEffect(() => {
    if (initialDomain) run(initialDomain);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(domain);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShieldCheck className="text-mdo-500" /> Audit DNS / Anti-spoofing
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Verification rapide des enregistrements MX, SPF et DMARC d'un domaine. Utile pour les audits cyber et les onboardings clients.
        </p>
      </div>

      <form onSubmit={submit} className="card p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[260px]">
          <label className="label">Domaine a auditer</label>
          <input
            className="input"
            type="text"
            placeholder="exemple.fr"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            autoFocus
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading || !domain.trim()}>
          <Search size={16} className="mr-1" />
          {loading ? 'Audit en cours...' : 'Lancer l\'audit'}
        </button>
      </form>

      {report && (
        <>
          {/* Score global */}
          <div className="card p-6 flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm text-slate-500">Domaine</p>
              <p className="text-xl font-bold font-mono">{report.domain}</p>
              <p className="text-xs text-slate-400 mt-1">
                Verifie le {new Date(report.checkedAt).toLocaleString('fr-FR')}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-slate-500">Score</p>
                <p className="text-3xl font-bold">{report.score}<span className="text-base text-slate-400">/100</span></p>
              </div>
              <div className={'rounded-full w-20 h-20 flex items-center justify-center text-4xl font-bold ' + gradeColor(report.grade)}>
                {report.grade}
              </div>
            </div>
          </div>

          {/* Resume */}
          <div className="card p-4 text-sm">
            <p className="font-medium mb-2">Resume</p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600 dark:text-slate-300">
              {report.summary.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* MX */}
            <CheckBlock title="MX (reception email)" ok={report.mx.ok} icon={Server}>
              {report.mx.error && <p className="text-red-600">{report.mx.error}</p>}
              {report.mx.records.length === 0 ? (
                <p className="text-slate-500 italic">Aucun enregistrement MX. Le domaine ne recoit pas d'email.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-1">Priorite</th>
                      <th className="py-1">Serveur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.mx.records.map((r, i) => (
                      <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                        <td className="py-1">{r.priority}</td>
                        <td className="py-1 font-mono">{r.exchange}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CheckBlock>

            {/* SPF */}
            <CheckBlock title="SPF (autorisation envoi)" ok={report.spf.ok} icon={Mail}>
              {report.spf.raw ? (
                <>
                  <code className="block bg-slate-100 dark:bg-slate-700 p-2 rounded text-xs break-all">{report.spf.raw}</code>
                  {report.spf.allQualifier && (
                    <p className="text-xs">
                      <span className="text-slate-500">Politique : </span>
                      <span className="font-mono font-bold">{report.spf.allQualifier}all</span>
                    </p>
                  )}
                  {report.spf.includes.length > 0 && (
                    <p className="text-xs text-slate-500">
                      Includes : {report.spf.includes.join(', ')}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-slate-500 italic">Aucun SPF publie.</p>
              )}
              {report.spf.problems.length > 0 && (
                <div className="space-y-1 mt-2">
                  {report.spf.problems.map((p, i) => (
                    <div key={i} className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
              )}
            </CheckBlock>

            {/* DMARC */}
            <CheckBlock title="DMARC (anti-spoofing)" ok={report.dmarc.ok} icon={Lock}>
              {report.dmarc.raw ? (
                <>
                  <code className="block bg-slate-100 dark:bg-slate-700 p-2 rounded text-xs break-all">{report.dmarc.raw}</code>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {report.dmarc.policy && <p><span className="text-slate-500">Politique : </span><span className="font-mono">{report.dmarc.policy}</span></p>}
                    {report.dmarc.pct !== null && <p><span className="text-slate-500">Pct : </span>{report.dmarc.pct}%</p>}
                    {report.dmarc.rua && <p className="col-span-2 truncate"><span className="text-slate-500">Rua : </span><span className="font-mono">{report.dmarc.rua}</span></p>}
                  </div>
                </>
              ) : (
                <p className="text-slate-500 italic">Aucun DMARC publie.</p>
              )}
              {report.dmarc.problems.length > 0 && (
                <div className="space-y-1 mt-2">
                  {report.dmarc.problems.map((p, i) => (
                    <div key={i} className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
              )}
            </CheckBlock>
          </div>

          {/* Recommandations rapides */}
          {(report.score < 90) && (
            <div className="card p-5 bg-mdo-50 dark:bg-slate-700">
              <p className="font-semibold mb-2">Recommandations</p>
              <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                {!report.spf.raw && <li>Publier un enregistrement SPF (TXT racine du domaine), exemple : <code>v=spf1 include:_spf.google.com -all</code></li>}
                {report.spf.raw && report.spf.allQualifier === '+' && <li>Remplacer <code>+all</code> par <code>-all</code> ou <code>~all</code></li>}
                {!report.dmarc.raw && <li>Publier un DMARC sur <code>_dmarc.{report.domain}</code>, demarrer avec <code>v=DMARC1; p=none; rua=mailto:dmarc@{report.domain}</code></li>}
                {report.dmarc.policy === 'none' && <li>Apres quelques semaines de monitoring (p=none), passer en <code>p=quarantine</code> puis <code>p=reject</code></li>}
                {report.dmarc.raw && !report.dmarc.rua && <li>Ajouter une adresse <code>rua=</code> pour recevoir les rapports agreges DMARC</li>}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AuditDnsPage() {
  return (
    <Suspense fallback={<div>Chargement...</div>}>
      <AuditDnsInner />
    </Suspense>
  );
}
