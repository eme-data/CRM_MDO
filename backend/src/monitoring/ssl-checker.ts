import * as tls from 'tls';
import { URL } from 'url';

export interface SslCheckResult {
  ok: boolean;
  validTo?: Date;
  validFrom?: Date;
  issuer?: string;
  subject?: string;
  daysRemaining?: number;
  error?: string;
}

// Effectue un handshake TLS sur la cible donnee et lit le certificat presente
// par le serveur. Cible attendue : "example.com", "example.com:443", ou
// une URL "https://example.com/path" (le path est ignore).
// Timeout par defaut : 10 secondes.
export function checkSslCertificate(target: string, timeoutMs = 10_000): Promise<SslCheckResult> {
  let host = target.trim();
  let port = 443;

  // Parse URL si l'utilisateur a colle "https://..."
  if (host.startsWith('http://') || host.startsWith('https://')) {
    try {
      const u = new URL(host);
      host = u.hostname;
      if (u.port) port = parseInt(u.port, 10);
    } catch {
      return Promise.resolve({ ok: false, error: 'URL invalide' });
    }
  } else if (host.includes(':')) {
    const [h, p] = host.split(':');
    host = h;
    port = parseInt(p, 10) || 443;
  }

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (r: SslCheckResult) => {
      if (resolved) return;
      resolved = true;
      try {
        socket.destroy();
      } catch {}
      resolve(r);
    };

    const socket = tls.connect(
      {
        host,
        port,
        servername: host, // SNI obligatoire pour les serveurs hebergeant plusieurs domaines
        rejectUnauthorized: false, // on veut lire les certs meme si invalides (pour reporter)
        timeout: timeoutMs,
      },
      () => {
        const cert = socket.getPeerCertificate(false);
        if (!cert || Object.keys(cert).length === 0) {
          finish({ ok: false, error: 'Aucun certificat presente par ' + host + ':' + port });
          return;
        }
        const validTo = new Date(cert.valid_to);
        const validFrom = new Date(cert.valid_from);
        const daysRemaining = Math.floor((validTo.getTime() - Date.now()) / 86_400_000);
        finish({
          ok: true,
          validTo,
          validFrom,
          issuer: cert.issuer?.O ?? cert.issuer?.CN,
          subject: cert.subject?.CN,
          daysRemaining,
        });
      },
    );

    socket.on('error', (err) => finish({ ok: false, error: err.message }));
    socket.on('timeout', () => finish({ ok: false, error: 'Timeout TLS ' + host + ':' + port }));
  });
}
