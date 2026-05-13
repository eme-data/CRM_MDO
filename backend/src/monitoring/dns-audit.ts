import { promises as dns } from 'dns';

// Audit basique des principaux mecanismes anti-spoofing email d'un domaine.
// Retourne un score 0-100 + une note A-F + le detail des problemes detectes.
// N'effectue aucun appel SMTP : uniquement des resolutions DNS (rapides).

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface MxResult {
  ok: boolean;
  records: Array<{ exchange: string; priority: number }>;
  error?: string;
}

export interface SpfResult {
  ok: boolean;
  raw: string | null;
  allQualifier: '+' | '-' | '~' | '?' | null; // qualifier du mecanisme final 'all'
  includes: string[];
  problems: string[];
  error?: string;
}

export interface DmarcResult {
  ok: boolean;
  raw: string | null;
  policy: 'none' | 'quarantine' | 'reject' | null;
  subdomainPolicy: 'none' | 'quarantine' | 'reject' | null;
  pct: number | null;
  rua: string | null;
  ruf: string | null;
  problems: string[];
  error?: string;
}

export interface DnsAuditReport {
  domain: string;
  checkedAt: string;
  score: number;
  grade: Grade;
  mx: MxResult;
  spf: SpfResult;
  dmarc: DmarcResult;
  summary: string[];
}

const DNS_TIMEOUT_MS = 5000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Timeout DNS (' + label + ')')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

async function safeResolveTxt(name: string): Promise<string[][] | null> {
  try {
    return await withTimeout(dns.resolveTxt(name), DNS_TIMEOUT_MS, 'TXT ' + name);
  } catch (err: any) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') return [];
    return null;
  }
}

async function safeResolveMx(name: string): Promise<{ exchange: string; priority: number }[] | null> {
  try {
    return await withTimeout(dns.resolveMx(name), DNS_TIMEOUT_MS, 'MX ' + name);
  } catch (err: any) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') return [];
    return null;
  }
}

function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  if (d.startsWith('http://') || d.startsWith('https://')) {
    try { d = new URL(d).hostname; } catch { /* ignore */ }
  }
  d = d.replace(/^\./, '').replace(/\.$/, '');
  return d;
}

function parseSpf(raw: string): { allQualifier: SpfResult['allQualifier']; includes: string[] } {
  const tokens = raw.split(/\s+/);
  let allQualifier: SpfResult['allQualifier'] = null;
  const includes: string[] = [];
  for (const t of tokens) {
    const m = t.match(/^([+\-~?])?all$/i);
    if (m) {
      allQualifier = (m[1] as any) || '+';
      continue;
    }
    if (/^include:/i.test(t)) includes.push(t.slice(8));
  }
  return { allQualifier, includes };
}

function parseDmarc(raw: string): {
  policy: DmarcResult['policy'];
  subdomainPolicy: DmarcResult['subdomainPolicy'];
  pct: number | null;
  rua: string | null;
  ruf: string | null;
} {
  const out: any = { policy: null, subdomainPolicy: null, pct: null, rua: null, ruf: null };
  for (const part of raw.split(';').map((s) => s.trim()).filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim().toLowerCase();
    const v = part.slice(eq + 1).trim();
    if (k === 'p' && /^(none|quarantine|reject)$/i.test(v)) out.policy = v.toLowerCase();
    else if (k === 'sp' && /^(none|quarantine|reject)$/i.test(v)) out.subdomainPolicy = v.toLowerCase();
    else if (k === 'pct') {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n)) out.pct = n;
    }
    else if (k === 'rua') out.rua = v;
    else if (k === 'ruf') out.ruf = v;
  }
  return out;
}

export async function auditDns(rawDomain: string): Promise<DnsAuditReport> {
  const domain = normalizeDomain(rawDomain);
  const summary: string[] = [];
  let score = 0;

  // ----- MX -----
  let mx: MxResult;
  const mxRaw = await safeResolveMx(domain);
  if (mxRaw === null) {
    mx = { ok: false, records: [], error: 'Erreur resolution MX' };
    summary.push('MX : erreur DNS');
  } else if (mxRaw.length === 0) {
    mx = { ok: false, records: [] };
    summary.push("MX : aucun (ce domaine ne recoit pas d'email)");
  } else {
    mx = { ok: true, records: mxRaw.sort((a, b) => a.priority - b.priority) };
    score += 10;
    summary.push('MX : ' + mxRaw.length + ' enregistrement(s)');
  }

  // ----- SPF (TXT du domaine commencant par v=spf1) -----
  let spf: SpfResult;
  const txtRaw = await safeResolveTxt(domain);
  if (txtRaw === null) {
    spf = { ok: false, raw: null, allQualifier: null, includes: [], problems: ['Erreur DNS sur les TXT'] };
    summary.push('SPF : erreur DNS');
  } else {
    const flat = txtRaw.map((arr) => arr.join(''));
    const spfRecords = flat.filter((s) => /^v=spf1\b/i.test(s));
    if (spfRecords.length === 0) {
      spf = { ok: false, raw: null, allQualifier: null, includes: [], problems: ['Aucun SPF publie'] };
      summary.push('SPF : absent');
    } else if (spfRecords.length > 1) {
      spf = {
        ok: false, raw: spfRecords.join(' | '), allQualifier: null, includes: [],
        problems: ['Plusieurs enregistrements SPF (interdit par RFC 7208 - les serveurs vont ignorer)'],
      };
      summary.push('SPF : multiple (probleme RFC)');
    } else {
      const raw = spfRecords[0];
      const { allQualifier, includes } = parseSpf(raw);
      const problems: string[] = [];
      if (!allQualifier) problems.push("Aucun mecanisme 'all' (politique implicite ?all - faible)");
      else if (allQualifier === '+') problems.push("Politique '+all' - autorise tout le monde a envoyer (a corriger)");
      else if (allQualifier === '?') problems.push("Politique '?all' - neutre, ne protege pas");
      spf = { ok: problems.length === 0, raw, allQualifier, includes, problems };

      // scoring
      score += 25; // present
      if (allQualifier === '-' || allQualifier === '~') score += 15;
      summary.push('SPF : present (' + (allQualifier ?? '?') + 'all)');
    }
  }

  // ----- DMARC (TXT de _dmarc.<domain>) -----
  let dmarc: DmarcResult;
  const dmarcRaw = await safeResolveTxt('_dmarc.' + domain);
  if (dmarcRaw === null) {
    dmarc = { ok: false, raw: null, policy: null, subdomainPolicy: null, pct: null, rua: null, ruf: null, problems: ['Erreur DNS sur _dmarc'] };
    summary.push('DMARC : erreur DNS');
  } else {
    const flat = dmarcRaw.map((arr) => arr.join(''));
    const dmarcRecords = flat.filter((s) => /^v=DMARC1\b/i.test(s));
    if (dmarcRecords.length === 0) {
      dmarc = { ok: false, raw: null, policy: null, subdomainPolicy: null, pct: null, rua: null, ruf: null, problems: ['Aucun enregistrement DMARC'] };
      summary.push('DMARC : absent');
    } else if (dmarcRecords.length > 1) {
      dmarc = {
        ok: false, raw: dmarcRecords.join(' | '), policy: null, subdomainPolicy: null,
        pct: null, rua: null, ruf: null,
        problems: ['Plusieurs enregistrements DMARC (a fusionner)'],
      };
      summary.push('DMARC : multiple');
    } else {
      const raw = dmarcRecords[0];
      const parsed = parseDmarc(raw);
      const problems: string[] = [];
      if (!parsed.policy) problems.push("Pas de tag 'p=' (DMARC invalide)");
      if (parsed.policy === 'none') problems.push("Politique 'p=none' (mode observation seulement, n'arrete pas le spoofing)");
      if (parsed.pct !== null && parsed.pct < 100) problems.push("pct=" + parsed.pct + " (la politique ne s'applique qu'a une fraction du trafic)");
      if (!parsed.rua) problems.push("Pas de 'rua' (vous ne recevez pas les rapports agrege)");

      dmarc = { ok: problems.length === 0, raw, ...parsed, problems };
      score += 20; // present
      if (parsed.policy === 'quarantine') score += 10;
      else if (parsed.policy === 'reject') score += 20;
      if (parsed.rua) score += 10;
      summary.push('DMARC : present (p=' + (parsed.policy ?? '?') + ')');
    }
  }

  // ----- Grade global -----
  if (score > 100) score = 100;
  let grade: Grade = 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 75) grade = 'B';
  else if (score >= 55) grade = 'C';
  else if (score >= 35) grade = 'D';

  return {
    domain,
    checkedAt: new Date().toISOString(),
    score,
    grade,
    mx,
    spf,
    dmarc,
    summary,
  };
}
