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
  // ---------- Securite / Authentification ----------
  {
    key: 'auth.mfaRequiredRoles',
    category: 'security',
    label: 'Roles pour lesquels la 2FA est obligatoire',
    description:
      'Liste de roles separes par virgules (ADMIN,MANAGER,SALES,READONLY). Les utilisateurs concernes verront leur 2FA non activee detectee au login : ils restent connectes mais sont rediriges vers la page MFA et ne peuvent acceder qu\'a /mfa et /auth/me tant que la 2FA n\'est pas activee.',
    defaultValue: 'ADMIN,MANAGER',
    envVar: 'MFA_REQUIRED_ROLES',
  },
  {
    key: 'auth.passwordMinLength',
    category: 'security',
    label: 'Longueur minimale des mots de passe',
    description: 'Recommande : 12 caracteres minimum.',
    defaultValue: '12',
    envVar: 'PASSWORD_MIN_LENGTH',
  },

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

  // ---------- SLA par offre (en heures) ----------
  // Delai de reponse cible avant resolution attendue
  {
    key: 'sla.essentiel.responseHours',
    category: 'sla',
    label: 'SLA Essentiel - delai de reponse (heures)',
    description: 'Heures avant echeance pour les tickets clients sur offre Essentiel',
    defaultValue: '24',
  },
  {
    key: 'sla.pro.responseHours',
    category: 'sla',
    label: 'SLA Pro - delai de reponse (heures)',
    defaultValue: '8',
  },
  {
    key: 'sla.souverain.responseHours',
    category: 'sla',
    label: 'SLA Souverain - delai de reponse (heures)',
    defaultValue: '4',
  },
  {
    key: 'sla.default.responseHours',
    category: 'sla',
    label: 'SLA par defaut (sans contrat actif) - delai en heures',
    defaultValue: '48',
  },
  // Multiplicateurs par priorite
  {
    key: 'sla.priority.urgent',
    category: 'sla',
    label: 'Multiplicateur priorite URGENT',
    description: 'ex: 0.25 = SLA divise par 4 si ticket urgent (1h Souverain devient 15min)',
    defaultValue: '0.25',
  },
  {
    key: 'sla.priority.high',
    category: 'sla',
    label: 'Multiplicateur priorite HIGH',
    defaultValue: '0.5',
  },

  // ---------- Facturation externe (Qonto Factures) ----------
  // Note 2026-05 : Sellsy retire du stack MDO. Les anciennes entrees
  // billing.sellsy.* restent eventuellement en base (settings non purges)
  // mais ne sont plus seedees ni utilisees par le code.
  {
    key: 'billing.provider',
    category: 'billing',
    label: 'Outil de facturation actif',
    description:
      'Choix du moteur de facturation. Valeurs : "none" (interne CRM, mode legacy) ou "qonto" (Qonto Factures, PDP).',
    defaultValue: 'none',
    envVar: 'BILLING_PROVIDER',
  },
  {
    key: 'billing.autoPushContracts',
    category: 'billing',
    label: 'Pousser auto les nouveaux contrats vers le provider',
    description:
      'Si true, a la creation/activation d\'un Contract, le client + l\'abonnement sont automatiquement crees dans Qonto.',
    defaultValue: 'false',
  },
  {
    key: 'billing.disableInternalCron',
    category: 'billing',
    label: 'Desactiver la generation interne mensuelle de factures',
    description:
      'Recommande quand Qonto est actif : evite de creer des doublons cote CRM. Le cron interne reste utile uniquement en mode "none".',
    defaultValue: 'true',
  },

  // -- Qonto --
  {
    key: 'billing.qonto.organizationSlug',
    category: 'billing',
    label: 'Qonto - Organization slug',
    description: 'Slug de l\'organisation Qonto (visible dans Settings > Integrations & API).',
    envVar: 'QONTO_ORGANIZATION_SLUG',
  },
  {
    key: 'billing.qonto.secretKey',
    category: 'billing',
    label: 'Qonto - Secret API',
    description:
      'Cle secrete API Qonto. Utilisee en lecture pour synchroniser les transactions et rapprocher les paiements.',
    isSecret: true,
    envVar: 'QONTO_SECRET_KEY',
  },
  {
    key: 'billing.qonto.apiBase',
    category: 'billing',
    label: 'Qonto - URL de base API',
    defaultValue: 'https://thirdparty.qonto.com/v2',
    envVar: 'QONTO_API_BASE',
  },
  {
    key: 'billing.qonto.syncEnabled',
    category: 'billing',
    label: 'Qonto - Activer la synchro automatique des transactions',
    description: 'Cron toutes les heures qui importe les nouvelles transactions Qonto pour rapprochement.',
    defaultValue: 'false',
  },

  // ---------- Rapports clients mensuels ----------
  {
    key: 'reports.monthlyAutoSend',
    category: 'reports',
    label: 'Rapport mensuel - envoi automatique le 1er du mois',
    description:
      'Si actif, un rapport mensuel est genere et envoye au contact principal de chaque societe avec statut CUSTOMER le 1er du mois a 08h00.',
    defaultValue: 'true',
  },
  {
    key: 'app.publicUrl',
    category: 'general',
    label: 'URL publique du CRM',
    description:
      'Base URL utilisee pour construire les liens de telechargement publics des rapports (ex. https://crm.mdoservices.fr).',
    defaultValue: 'https://crm.mdoservices.fr',
    envVar: 'PUBLIC_URL',
  },

  // ---------- Portail client ----------
  {
    key: 'app.portalUrl',
    category: 'general',
    label: 'URL publique du portail client',
    description:
      'Base URL utilisee dans les emails magic link envoyes aux clients (ex. https://client.mdoservices.fr). Si vide, on utilise app.publicUrl.',
    defaultValue: '',
    envVar: 'PORTAL_URL',
  },

  // ---------- Microsoft 365 / Graph API ----------
  {
    key: 'm365.clientId',
    category: 'integrations',
    label: 'Microsoft 365 - Application (client) ID',
    description:
      "GUID de l'application multi-tenant enregistree sur Entra ID du tenant MDO Services. Voir docs/deploy-m365.md pour la procedure.",
    envVar: 'M365_CLIENT_ID',
  },
  {
    key: 'm365.clientSecret',
    category: 'integrations',
    label: 'Microsoft 365 - Client secret',
    description:
      "Secret client genere dans Entra ID > Certificates & secrets de l'application MDO. A renouveler avant expiration (max 24 mois).",
    isSecret: true,
    envVar: 'M365_CLIENT_SECRET',
  },

  // ---------- NPS / Satisfaction client ----------
  {
    key: 'nps.autoSendOnResolved',
    category: 'reports',
    label: 'NPS - envoi automatique a la resolution d\'un ticket',
    description:
      'Si actif, un mail demandant au contact de noter son experience (0-10) est envoye automatiquement quand un ticket passe en statut RESOLVED.',
    defaultValue: 'true',
  },
];

export function findSettingDef(key: string): SettingDef | undefined {
  return SETTINGS_DEFS.find((s) => s.key === key);
}
