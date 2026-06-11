// Helper pur de chiffrement symetrique (AES-256-GCM) aligne sur
// SecretsService (client-docs) : meme algo, meme derivation scrypt depuis
// SECRETS_MASTER_KEY. Extrait ici en fonctions pures pour etre reutilisable
// hors DI (SsoService capture le refresh token au login, MailService le relit
// a l'envoi) sans coupler les modules.
//
// IMPORTANT : ne JAMAIS changer ALGO / salt apres mise en service, sinon les
// valeurs chiffrees existantes (refresh tokens M365) deviennent illisibles.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const SALT = 'crm-mdo-secrets-salt';

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  // Meme fallback que SecretsService (SECRETS_MASTER_KEY sinon JWT secret).
  const raw = process.env.SECRETS_MASTER_KEY ?? process.env.JWT_SECRET;
  if (!raw) throw new Error('SECRETS_MASTER_KEY non defini : chiffrement indisponible');
  cachedKey = scryptSync(raw, SALT, 32);
  return cachedKey;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptSecret(stored: string): string {
  const buf = Buffer.from(stored, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(IV_LEN, IV_LEN + 16);
  const encrypted = buf.subarray(IV_LEN + 16);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
