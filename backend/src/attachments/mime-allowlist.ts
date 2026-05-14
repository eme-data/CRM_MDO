// Allow-list MIME + extension pour les uploads CRM.
//
// On valide a la fois le mimetype (cote client, falsifiable) ET l'extension :
// les deux doivent matcher dans la table pour qu'un fichier soit accepte.
// La verification du contenu reel (magic bytes) n'est pas faite ici pour
// rester legere ; si on traite des fichiers vraiment hostiles (uploads
// publics non authentifies par exemple), repasser via `file-type` ou ClamAV
// avant publication.

export interface AllowedFileSpec {
  mime: string;
  extensions: string[];
}

export const ATTACHMENT_ALLOWED_TYPES: AllowedFileSpec[] = [
  // Documents
  { mime: 'application/pdf', extensions: ['.pdf'] },
  { mime: 'application/msword', extensions: ['.doc'] },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['.docx'],
  },
  { mime: 'application/vnd.ms-excel', extensions: ['.xls'] },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['.xlsx'],
  },
  { mime: 'application/vnd.ms-powerpoint', extensions: ['.ppt'] },
  {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extensions: ['.pptx'],
  },
  { mime: 'application/vnd.oasis.opendocument.text', extensions: ['.odt'] },
  { mime: 'application/vnd.oasis.opendocument.spreadsheet', extensions: ['.ods'] },
  // Texte
  { mime: 'text/plain', extensions: ['.txt', '.log', '.md'] },
  { mime: 'text/csv', extensions: ['.csv'] },
  // Images (PAS de SVG : risque XSS via <script>)
  { mime: 'image/png', extensions: ['.png'] },
  { mime: 'image/jpeg', extensions: ['.jpg', '.jpeg'] },
  { mime: 'image/gif', extensions: ['.gif'] },
  { mime: 'image/webp', extensions: ['.webp'] },
  { mime: 'image/heic', extensions: ['.heic'] },
  // Archives
  { mime: 'application/zip', extensions: ['.zip'] },
  { mime: 'application/x-zip-compressed', extensions: ['.zip'] },
  // Email
  { mime: 'message/rfc822', extensions: ['.eml'] },
];

const MIME_INDEX = new Map<string, Set<string>>();
for (const spec of ATTACHMENT_ALLOWED_TYPES) {
  const existing = MIME_INDEX.get(spec.mime) ?? new Set<string>();
  for (const ext of spec.extensions) existing.add(ext.toLowerCase());
  MIME_INDEX.set(spec.mime, existing);
}

const EXT_INDEX = new Set<string>();
for (const spec of ATTACHMENT_ALLOWED_TYPES) {
  for (const ext of spec.extensions) EXT_INDEX.add(ext.toLowerCase());
}

export function isAttachmentTypeAllowed(mimetype: string, filename: string): boolean {
  const ext = extractExtension(filename);
  if (!ext) return false;
  if (!EXT_INDEX.has(ext)) return false;
  const allowedExts = MIME_INDEX.get(mimetype.toLowerCase());
  if (!allowedExts) return false;
  return allowedExts.has(ext);
}

export function extractExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx < 0 || idx === filename.length - 1) return '';
  return filename.slice(idx).toLowerCase();
}

export function describeAllowed(): string {
  return Array.from(EXT_INDEX).sort().join(', ');
}
