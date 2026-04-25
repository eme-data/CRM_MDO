// Definition des settings disponibles dans l'admin UI.
// Le SettingsService les seed automatiquement au demarrage si absents en BDD.
// Les valeurs initiales viennent des variables d'environnement (.env), si presentes.

export interface SettingDef {
  key: string;
  category: string;
  label: string;
  description?: string;
  isSecret?: boolean;
  envVar?: string; // variable d'environnement de fallback / d'init
  defaultValue?: string;
}

export const SETTINGS_DEFS: SettingDef[] = [
  // ---------- Annuaire entreprises ----------
  {
    key: 'lookup.pappersApiKey',
    category: 'lookup',
    label: 'Cle API Pappers',
    description: 'Cle obtenue sur https://www.pappers.fr/api (recherche entreprise enrichie)',
    isSecret: true,
    envVar: 'PAPPERS_API_KEY',
  },
  {
    key: 'lookup.sireneApiKey',
    category: 'lookup',
    label: 'Cle API INSEE Sirene',
    description: 'Cle d\'integration X-INSEE-Api-Key obtenue sur https://api.insee.fr',
    isSecret: true,
    envVar: 'SIRENE_API_KEY',
  },

  // ---------- SMTP sortant ----------
  {
    key: 'smtp.host',
    category: 'smtp',
    label: 'Hote SMTP',
    description: 'Office 365 : smtp.office365.com',
    envVar: 'SMTP_HOST',
  },
  {
    key: 'smtp.port',
    category: 'smtp',
    label: 'Port SMTP',
    description: '587 pour STARTTLS (Office 365), 465 pour SSL',
    envVar: 'SMTP_PORT',
    defaultValue: '587',
  },
  {
    key: 'smtp.secure',
    category: 'smtp',
    label: 'Connexion SSL stricte',
    description: 'true pour port 465, false pour port 587 (STARTTLS)',
    envVar: 'SMTP_SECURE',
    defaultValue: 'false',
  },
  {
    key: 'smtp.user',
    category: 'smtp',
    label: 'Utilisateur SMTP',
    envVar: 'SMTP_USER',
  },
  {
    key: 'smtp.password',
    category: 'smtp',
    label: 'Mot de passe SMTP',
    description: 'Office 365 : utiliser un App Password',
    isSecret: true,
    envVar: 'SMTP_PASSWORD',
  },
  {
    key: 'smtp.from',
    category: 'smtp',
    label: 'Adresse expediteur (From)',
    description: 'Ex : "MDO Services <no-reply@mdoservices.fr>"',
    envVar: 'SMTP_FROM',
  },

  // ---------- IMAP entrant (creation tickets) ----------
  {
    key: 'imap.enabled',
    category: 'imap',
    label: 'Activer la creation auto de tickets via IMAP',
    description: 'true / false',
    envVar: 'INBOUND_EMAIL_ENABLED',
    defaultValue: 'false',
  },
  {
    key: 'imap.autoAck',
    category: 'imap',
    label: 'Envoyer un accuse de reception automatique',
    description: 'true / false',
    envVar: 'INBOUND_AUTO_ACK',
    defaultValue: 'true',
  },
  {
    key: 'imap.host',
    category: 'imap',
    label: 'Hote IMAP',
    description: 'Office 365 : outlook.office365.com',
    envVar: 'IMAP_HOST',
  },
  {
    key: 'imap.port',
    category: 'imap',
    label: 'Port IMAP',
    envVar: 'IMAP_PORT',
    defaultValue: '993',
  },
  {
    key: 'imap.secure',
    category: 'imap',
    label: 'Connexion SSL stricte',
    description: 'true (defaut) / false',
    envVar: 'IMAP_SECURE',
    defaultValue: 'true',
  },
  {
    key: 'imap.user',
    category: 'imap',
    label: 'Utilisateur IMAP',
    description: 'Ex : support@mdoservices.fr',
    envVar: 'IMAP_USER',
  },
  {
    key: 'imap.password',
    category: 'imap',
    label: 'Mot de passe IMAP',
    description: 'App Password Office 365',
    isSecret: true,
    envVar: 'IMAP_PASSWORD',
  },
  {
    key: 'imap.folder',
    category: 'imap',
    label: 'Dossier IMAP a scanner',
    envVar: 'IMAP_FOLDER',
    defaultValue: 'INBOX',
  },
  {
    key: 'imap.processedFolder',
    category: 'imap',
    label: 'Dossier de tri apres traitement',
    description: 'Optionnel - vide = juste flag \\Seen',
    envVar: 'IMAP_PROCESSED_FOLDER',
  },
];

export function findSettingDef(key: string): SettingDef | undefined {
  return SETTINGS_DEFS.find((s) => s.key === key);
}
