import * as net from 'net';

export interface WhoisCheckResult {
  ok: boolean;
  expiresAt?: Date;
  registrar?: string;
  raw?: string;
  error?: string;
}

// Mapping TLD -> serveur whois IANA
// Pour les TLD non listes, on tente whois.iana.org puis on suit la redirection.
const TLD_SERVERS: Record<string, string> = {
  com: 'whois.verisign-grs.com',
  net: 'whois.verisign-grs.com',
  org: 'whois.publicinterestregistry.org',
  fr: 'whois.nic.fr',
  io: 'whois.nic.io',
  eu: 'whois.eu',
  info: 'whois.afilias.net',
  biz: 'whois.nic.biz',
  co: 'whois.nic.co',
  dev: 'whois.nic.google',
  cloud: 'whois.nic.cloud',
  app: 'whois.nic.google',
  re: 'whois.nic.fr',
  pm: 'whois.nic.fr',
  yt: 'whois.nic.fr',
  tf: 'whois.nic.fr',
  wf: 'whois.nic.fr',
};

function tldOf(domain: string): string {
  const parts = domain.toLowerCase().split('.');
  return parts[parts.length - 1] ?? '';
}

function queryWhoisServer(server: string, query: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: server, port: 43, timeout: timeoutMs });
    let data = '';
    socket.on('connect', () => socket.write(query + '\r\n'));
    socket.on('data', (chunk) => (data += chunk.toString('utf8')));
    socket.on('end', () => resolve(data));
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Timeout WHOIS ' + server));
    });
    socket.on('error', (err) => reject(err));
  });
}

// Patterns pour detecter la date d'expiration dans la reponse whois.
// Plusieurs registres utilisent des formats differents.
const EXPIRY_PATTERNS = [
  /Registry Expiry Date:\s*(\S+)/i,
  /Registrar Registration Expiration Date:\s*(\S+)/i,
  /Expir(?:y|ation) Date:\s*(\S+)/i,
  /Expires? On:\s*(\S+)/i,
  /paid-till:\s*(\S+)/i,
  /\bexpire\b[^:]*:\s*(\d{4}[-\/]\d{2}[-\/]\d{2}|\d{2}[-\/]\d{2}[-\/]\d{4})/i,
];

const REGISTRAR_PATTERNS = [/Registrar:\s*(.+)/i, /Sponsoring Registrar:\s*(.+)/i];

function parseExpiry(raw: string): Date | undefined {
  for (const re of EXPIRY_PATTERNS) {
    const m = raw.match(re);
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return undefined;
}

function parseRegistrar(raw: string): string | undefined {
  for (const re of REGISTRAR_PATTERNS) {
    const m = raw.match(re);
    if (m) return m[1].trim();
  }
  return undefined;
}

export async function checkDomainWhois(domain: string, timeoutMs = 10_000): Promise<WhoisCheckResult> {
  let cleaned = domain.trim().toLowerCase();
  // Retire eventuel http(s):// ou path
  cleaned = cleaned.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleaned)) {
    return { ok: false, error: 'Nom de domaine invalide' };
  }

  const tld = tldOf(cleaned);
  let server = TLD_SERVERS[tld];

  try {
    if (!server) {
      // Demande au serveur IANA quel est le whois faisant autorite
      const iana = await queryWhoisServer('whois.iana.org', cleaned, timeoutMs);
      const m = iana.match(/whois:\s*(\S+)/i);
      server = m ? m[1] : 'whois.iana.org';
    }

    const raw = await queryWhoisServer(server, cleaned, timeoutMs);
    const expiresAt = parseExpiry(raw);
    const registrar = parseRegistrar(raw);

    if (!expiresAt) {
      return { ok: false, error: 'Date d\'expiration non trouvee dans la reponse WHOIS', raw };
    }
    return { ok: true, expiresAt, registrar, raw };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
