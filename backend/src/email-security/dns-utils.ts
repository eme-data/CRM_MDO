// Helpers DNS pour la verification SPF / DMARC / DKIM. Utilise dns/promises
// (Node natif, pas de lib externe). Timeout via AbortSignal pour eviter
// qu'un domaine cassé ne bloque le cron pendant 30s.

import { promises as dns } from 'dns';

const DNS_TIMEOUT_MS = 5000;

// Selectors DKIM communs a tester. Liste ordonnee par frequence d'usage.
// On s'arrete au premier qui repond (NoData/NXDomain pour les autres = OK).
const COMMON_DKIM_SELECTORS = [
  'default', 'selector1', 'selector2', 'google', 's1', 's2', 'k1', 'k2',
  'mxvault', 'protonmail', 'protonmail2', 'protonmail3',
  'fd', 'fd2', 'mxsmtp', 'dkim',
];

async function resolveTxtSafe(hostname: string): Promise<string[] | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), DNS_TIMEOUT_MS);
    try {
      // Note : dns.resolveTxt ne supporte pas AbortSignal nativement.
      // On race avec setTimeout pour avoir un fail-fast.
      const result = await Promise.race([
        dns.resolveTxt(hostname),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('DNS timeout')), DNS_TIMEOUT_MS),
        ),
      ]);
      // resolveTxt retourne string[][] (un tableau par record, chaque record
      // est un tableau de chunks) — on join chaque record.
      return (result as string[][]).map((r) => r.join(''));
    } finally {
      clearTimeout(t);
    }
  } catch (err: any) {
    // ENOTFOUND / ENODATA = pas de record, c'est normal pour DKIM/DMARC.
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') return [];
    throw err;
  }
}

export interface SpfResult {
  record: string | null;
  policy: 'pass' | 'softfail' | 'neutral' | 'all' | null;
}

export async function lookupSpf(domain: string): Promise<SpfResult> {
  const records = await resolveTxtSafe(domain);
  if (!records) return { record: null, policy: null };
  const spf = records.find((r) => r.toLowerCase().startsWith('v=spf1'));
  if (!spf) return { record: null, policy: null };
  // Detection politique : -all=pass, ~all=softfail, ?all=neutral, +all=all
  const lower = spf.toLowerCase();
  let policy: SpfResult['policy'] = null;
  if (lower.endsWith('-all') || lower.includes(' -all')) policy = 'pass';
  else if (lower.endsWith('~all') || lower.includes(' ~all')) policy = 'softfail';
  else if (lower.endsWith('?all') || lower.includes(' ?all')) policy = 'neutral';
  else if (lower.endsWith('+all') || lower.includes(' +all')) policy = 'all';
  return { record: spf, policy };
}

export interface DmarcResult {
  record: string | null;
  policy: 'reject' | 'quarantine' | 'none' | null;
  rua: string | null;
  subdomainPolicy: string | null;
}

export async function lookupDmarc(domain: string): Promise<DmarcResult> {
  const records = await resolveTxtSafe('_dmarc.' + domain);
  if (!records) return { record: null, policy: null, rua: null, subdomainPolicy: null };
  const dmarc = records.find((r) => r.toLowerCase().startsWith('v=dmarc1'));
  if (!dmarc) return { record: null, policy: null, rua: null, subdomainPolicy: null };
  // Parse "p=reject; rua=mailto:..."
  const tags = new Map<string, string>();
  for (const part of dmarc.split(';')) {
    const [k, v] = part.split('=').map((s) => s?.trim().toLowerCase());
    if (k && v) tags.set(k, v);
  }
  const p = tags.get('p');
  const policy: DmarcResult['policy'] =
    p === 'reject' || p === 'quarantine' || p === 'none' ? p : null;
  return {
    record: dmarc,
    policy,
    rua: tags.get('rua') ?? null,
    subdomainPolicy: tags.get('sp') ?? null,
  };
}

export interface DkimResult {
  selector: string | null;
  record: string | null;
  present: boolean;
}

export async function lookupDkim(domain: string): Promise<DkimResult> {
  for (const selector of COMMON_DKIM_SELECTORS) {
    try {
      const records = await resolveTxtSafe(selector + '._domainkey.' + domain);
      if (records && records.length > 0) {
        const dkim = records.find((r) => r.toLowerCase().includes('v=dkim1') || r.toLowerCase().includes('p='));
        if (dkim) {
          return { selector, record: dkim.slice(0, 500), present: true };
        }
      }
    } catch {
      // selector pas configure, on continue
    }
  }
  return { selector: null, record: null, present: false };
}

export function computeScore(spf: SpfResult, dmarc: DmarcResult, dkim: DkimResult): number {
  let score = 0;
  if (spf.record) score += 25;
  if (spf.policy === 'pass') score += 10;
  if (dmarc.record) score += 30;
  if (dmarc.policy === 'reject') score += 15;
  else if (dmarc.policy === 'quarantine') score += 10;
  else if (dmarc.policy === 'none') score += 5;
  if (dmarc.rua) score += 5;
  if (dkim.present) score += 15;
  return Math.min(100, score);
}
