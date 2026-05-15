import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Garde-fou anti-SSRF (Server-Side Request Forgery).
//
// Sans ce garde-fou, un user qui peut creer un Monitor uptime ou un Webhook
// pourrait nous faire requeter :
//   - http://localhost:5432  (acces base interne)
//   - http://169.254.169.254 (metadata cloud AWS/GCP/Azure)
//   - http://10.0.0.1        (services internes du LAN)
//   - file:///etc/passwd     (lecture fichiers locaux via certains fetch)
//   - gopher://...           (autres protocoles exploitables)
//
// On bloque :
//   1. Tout schema autre que http/https
//   2. Tout hostname qui resout vers une IP privee/loopback/link-local
//   3. Les hostnames "localhost" et variantes
//
// Ce check doit etre fait IMMEDIATEMENT avant l'appel fetch — pas seulement
// a la creation du monitor — parce que :
//   a) le DNS peut changer (attaque rebinding : la 1re resolution renvoie
//      une IP publique, la 2e une IP privee). Cf article OWASP SSRF.
//   b) un monitor cree avant l'introduction du check peut etre malveillant.

const FORBIDDEN_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
]);

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  const [a, b] = parts;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local + AWS metadata)
  if (a === 169 && b === 254) return true;
  // 0.0.0.0/8
  if (a === 0) return true;
  // 100.64.0.0/10 (carrier-grade NAT, souvent utilise par k8s)
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // Loopback ::1
  if (lower === '::1') return true;
  // Unspecified ::
  if (lower === '::') return true;
  // Link-local fe80::/10
  if (lower.startsWith('fe80:') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
  // Unique local fc00::/7
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // IPv4-mapped ::ffff:127.0.0.1 -> on extrait l'IPv4
  const v4mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4mapped) return isPrivateIPv4(v4mapped[1]);
  return false;
}

export async function assertSafePublicUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('URL invalide');
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new BadRequestException('Protocole interdit (http/https uniquement)');
  }
  const host = parsed.hostname.toLowerCase();
  if (FORBIDDEN_HOSTNAMES.has(host)) {
    throw new BadRequestException('Hostname interdit (localhost)');
  }
  // Si c'est deja une IP litterale, on la valide directement.
  const ipKind = isIP(host);
  if (ipKind === 4 && isPrivateIPv4(host)) {
    throw new BadRequestException('IP privee interdite (' + host + ')');
  }
  if (ipKind === 6 && isPrivateIPv6(host)) {
    throw new BadRequestException('IP privee interdite (' + host + ')');
  }
  // Sinon on resout en DNS pour eviter le rebinding (un domaine qui resout
  // vers une IP privee, type http://attacker.com -> 127.0.0.1).
  if (ipKind === 0) {
    try {
      const records = await lookup(host, { all: true });
      for (const r of records) {
        if (r.family === 4 && isPrivateIPv4(r.address)) {
          throw new BadRequestException('Hostname resout vers une IP privee (' + r.address + ')');
        }
        if (r.family === 6 && isPrivateIPv6(r.address)) {
          throw new BadRequestException('Hostname resout vers une IP privee (' + r.address + ')');
        }
      }
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Resolution DNS impossible : ' + (err.message ?? 'unknown'));
    }
  }
}
