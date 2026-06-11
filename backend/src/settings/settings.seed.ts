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

  // ---------- Transport mail (SMTP vs Microsoft Graph) ----------
  // Permet d'envoyer les mails via Microsoft Graph (OAuth2 app-only) au lieu du
  // SMTP basic-auth, en reutilisant l'app Entra MDO (m365.clientId/secret).
  // Avantage : plus d'app-password, conforme a la depreciation du SMTP AUTH par
  // Microsoft. Les alertes (cron, sans user) partent d'une boite fixe.
  {
    key: 'mail.transport',
    category: 'smtp',
    label: 'Transport des emails',
    description:
      '"smtp" (defaut, basic-auth) ou "graph" (Microsoft 365 via OAuth2 app-only, reutilise l\'app Entra m365.clientId/secret). En "graph", renseigner mail.graphTenantId + mail.graphSender ci-dessous.',
    defaultValue: 'smtp',
  },
  {
    key: 'mail.graphTenantId',
    category: 'smtp',
    label: 'Graph - Azure AD Tenant ID',
    description:
      'GUID du tenant Entra MDO (Azure portal > Microsoft Entra ID > Overview). Requis pour le transport "graph".',
  },
  {
    key: 'mail.graphSender',
    category: 'smtp',
    label: 'Graph - Boite expeditrice',
    description:
      'UPN/adresse de la boite qui envoie (ex: no-reply@mdoservices.fr). L\'app Entra doit avoir la permission Mail.Send (application) + admin-consent ; restreindre a cette boite via une Application Access Policy Exchange (recommande).',
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

  // ---------- Signature electronique ----------
  {
    key: 'signature.provider',
    category: 'signature',
    label: 'Provider de signature electronique',
    description:
      'DOCUSEAL (self-hosted, souverain) | YOUSIGN (cloud FR, eIDAS Avance) | DISABLED. Si DISABLED, les boutons signature sont caches.',
    defaultValue: 'DISABLED',
    envVar: 'SIGNATURE_PROVIDER',
  },
  {
    key: 'signature.docuseal.apiUrl',
    category: 'signature',
    label: 'DocuSeal - URL API',
    description: 'Base URL de l\'instance DocuSeal (ex. https://docuseal.mdoservices.fr/api).',
    envVar: 'DOCUSEAL_API_URL',
  },
  {
    key: 'signature.docuseal.apiKey',
    category: 'signature',
    label: 'DocuSeal - cle API',
    description:
      'Token API genere depuis DocuSeal > Settings > API. Doit avoir les droits submissions:create et submissions:read.',
    isSecret: true,
    envVar: 'DOCUSEAL_API_KEY',
  },
  {
    key: 'signature.docuseal.webhookSecret',
    category: 'signature',
    label: 'DocuSeal - secret webhook (HMAC)',
    description:
      'Secret partage configure dans DocuSeal > Settings > Webhooks. Verifie la signature HMAC du header X-Docuseal-Signature.',
    isSecret: true,
    envVar: 'DOCUSEAL_WEBHOOK_SECRET',
  },
  {
    key: 'signature.yousign.apiUrl',
    category: 'signature',
    label: 'Yousign - URL API',
    description:
      'Base URL Yousign (sandbox : https://api-sandbox.yousign.app/v3 ; production : https://api.yousign.app/v3).',
    defaultValue: 'https://api.yousign.app/v3',
    envVar: 'YOUSIGN_API_URL',
  },
  {
    key: 'signature.yousign.apiKey',
    category: 'signature',
    label: 'Yousign - cle API',
    description: 'Bearer API key de l\'organisation Yousign.',
    isSecret: true,
    envVar: 'YOUSIGN_API_KEY',
  },
  {
    key: 'signature.yousign.webhookSecret',
    category: 'signature',
    label: 'Yousign - secret webhook',
    description: 'Secret du webhook Yousign (verification de signature).',
    isSecret: true,
    envVar: 'YOUSIGN_WEBHOOK_SECRET',
  },

  // ---------- Telephonie / VoIP ----------
  {
    key: 'voip.provider',
    category: 'voip',
    label: 'Provider telephonie',
    description:
      'TEL_URI (defaut, ouvre le telephone systeme via tel:+33...) | FREE_PRO (Free PRO Coms Pro API) | NONE',
    defaultValue: 'TEL_URI',
    envVar: 'VOIP_PROVIDER',
  },
  {
    key: 'voip.freepro.apiUrl',
    category: 'voip',
    label: 'Free PRO Coms Pro - URL API',
    description: 'URL de base de l\'API Coms Pro (recue avec le contrat Free PRO).',
    envVar: 'FREEPRO_API_URL',
  },
  {
    key: 'voip.freepro.apiKey',
    category: 'voip',
    label: 'Free PRO Coms Pro - cle API',
    description: 'Token Bearer fourni par Free PRO.',
    isSecret: true,
    envVar: 'FREEPRO_API_KEY',
  },
  {
    key: 'voip.freepro.callerId',
    category: 'voip',
    label: 'Free PRO Coms Pro - numero MDO (caller ID)',
    description:
      'Numero affiche au correspondant lors d\'un click-to-call. Format E.164 (+33...).',
    envVar: 'FREEPRO_CALLER_ID',
  },
  {
    key: 'voip.freepro.webhookSecret',
    category: 'voip',
    label: 'Free PRO - secret webhook',
    description: 'Secret HMAC pour verifier les webhooks d\'evenements d\'appel.',
    isSecret: true,
    envVar: 'FREEPRO_WEBHOOK_SECRET',
  },

  // ---------- IA / Claude ----------
  {
    key: 'ai.enabled',
    category: 'ai',
    label: 'Activer les fonctions IA',
    description:
      'Si false, tous les boutons IA (triage ticket, draft reponse, resume client) sont caches et les endpoints retournent 503.',
    defaultValue: 'false',
    envVar: 'AI_ENABLED',
  },
  {
    key: 'ai.apiKey',
    category: 'ai',
    label: 'Anthropic API key',
    description: 'Cle API obtenue sur console.anthropic.com (sk-ant-...).',
    isSecret: true,
    envVar: 'ANTHROPIC_API_KEY',
  },
  {
    key: 'ai.model',
    category: 'ai',
    label: 'Modele Claude par defaut',
    description:
      'Identifiant API (claude-sonnet-4-6, claude-opus-4-7, claude-haiku-4-5-20251001). Sonnet 4.6 = meilleur rapport prix/perf.',
    defaultValue: 'claude-sonnet-4-6',
    envVar: 'ANTHROPIC_MODEL',
  },
  {
    key: 'ai.companyContext',
    category: 'ai',
    label: 'Contexte MDO (system prompt)',
    description:
      'Description courte de MDO et du ton commercial. Inclus dans tous les prompts pour orienter les reponses (signature, formules, vocabulaire metier).',
    defaultValue:
      'Tu assistes MDO Services, MSP / cybersecurite en Occitanie. Tonalite : cordiale, claire, francais professionnel sans jargon excessif. Signature des emails : "L\'equipe MDO Services". Toujours signaler les actions necessitant une confirmation client.',
  },
  {
    key: 'ai.openaiApiKey',
    category: 'ai',
    label: 'OpenAI API key (Whisper transcription)',
    description:
      'Cle API OpenAI utilisee uniquement pour Whisper (transcription audio appels). Distincte de la cle Anthropic pour Claude.',
    isSecret: true,
    envVar: 'OPENAI_API_KEY',
  },
  {
    key: 'ai.transcribeCallsAuto',
    category: 'ai',
    label: 'Transcrire automatiquement les appels avec recording',
    description:
      'Si actif, le cron 15min transcrit via Whisper les CallLog ayant un recordingUrl mais pas encore de transcript. Genere ensuite un resume Claude.',
    defaultValue: 'false',
  },

  // ---------- Rentabilite / marges ----------
  {
    key: 'profitability.defaultHourlyRate',
    category: 'profitability',
    label: 'Taux horaire technicien par defaut (cout interne EUR/h)',
    description:
      'Cout charge moyen d\'une heure technicien (salaire + charges + outillage). Utilise pour calculer le cout total des time entries quand User.hourlyRate n\'est pas defini.',
    defaultValue: '45',
    envVar: 'DEFAULT_HOURLY_RATE',
  },
  {
    key: 'profitability.defaultBillingRate',
    category: 'profitability',
    label: 'Taux horaire facture par defaut (revenu EUR/h)',
    description:
      'Taux horaire facture client par defaut pour les TimeEntry billable sans tarif explicite (utilise pour estimer les revenus en l\'absence de TimeEntry.billingRate).',
    defaultValue: '90',
    envVar: 'DEFAULT_BILLING_RATE',
  },

  // ---------- Web Push (notifications navigateur) ----------
  {
    key: 'push.vapidPublicKey',
    category: 'push',
    label: 'VAPID public key',
    description:
      'Cle publique VAPID partagee aux abonnements navigateur. Generee une fois via POST /push/admin/generate-vapid (ADMIN). Re-generer la rendrait toutes les souscriptions invalides.',
    envVar: 'VAPID_PUBLIC_KEY',
  },
  {
    key: 'push.vapidPrivateKey',
    category: 'push',
    label: 'VAPID private key',
    description: 'Cle privee VAPID — JAMAIS exposee cote frontend.',
    isSecret: true,
    envVar: 'VAPID_PRIVATE_KEY',
  },
  {
    key: 'push.vapidSubject',
    category: 'push',
    label: 'VAPID subject (mailto: ou URL)',
    description:
      'Identifiant administrateur push (RFC 8292). Conventions : mailto:admin@mdoservices.fr',
    defaultValue: 'mailto:mathieu@mdoservices.fr',
    envVar: 'VAPID_SUBJECT',
  },

  // ---------- Customer Success ----------
  {
    key: 'customerSuccess.enabled',
    category: 'customer-success',
    label: 'Activer la programmation auto des QBR',
    description:
      'Si actif, le cron mensuel programme une revue trimestrielle pour chaque CUSTOMER actif dont la derniere review remonte a plus de N jours.',
    defaultValue: 'true',
  },
  {
    key: 'customerSuccess.frequencyDays',
    category: 'customer-success',
    label: 'Frequence des QBR (jours)',
    description:
      'Intervalle minimum entre 2 reviews trimestrielles. 90 = trimestriel, 180 = semestriel.',
    defaultValue: '90',
  },
  {
    key: 'customerSuccess.scheduleAheadDays',
    category: 'customer-success',
    label: 'Planifier la review combien de jours a l\'avance',
    description:
      'Quand le cron detecte qu\'une review est due, il la programme pour J + N jours (laisse le temps a l\'owner de caler le RDV).',
    defaultValue: '7',
  },

  // ---------- System backup (sauvegarde + restore CRM) ----------
  {
    key: 'systemBackup.dailyAuto',
    category: 'system-backup',
    label: 'Backup automatique quotidien (interne)',
    description:
      'Si actif, un backup complet (BDD + uploads) est cree chaque jour a 02:30 par le backend (en plus du script /etc/cron.d/crm-mdo-backup hote qui utilise restic pour off-site). Les deux sont complementaires : l\'auto cron interne sert pour rollback rapide depuis l\'UI.',
    defaultValue: 'true',
  },
  {
    key: 'systemBackup.retentionDays',
    category: 'system-backup',
    label: 'Retention backups internes (jours)',
    description:
      'Au-dela de N jours, les backups SCHEDULED sont supprimes par le cron de cleanup. Les MANUAL et PRE_RESTORE ne sont jamais auto-purges.',
    defaultValue: '30',
  },
  {
    key: 'systemBackup.includeUploads',
    category: 'system-backup',
    label: 'Inclure les uploads (pieces jointes) dans les backups',
    description:
      'Si actif, le tarball contient le volume uploads en plus du dump BDD. Desactiver SI les uploads sont sauvegardes ailleurs (S3, restic) — gain de temps + place.',
    defaultValue: 'true',
  },

  // ---------- SSO (OIDC) ----------
  // Active le bouton "Sign in with SSO" sur la page de login du tenant.
  // Chaque tenant configure SON IdP (Entra ID, Keycloak, etc.) via ces
  // settings. Les credentials etant sensibles, isSecret=true bloque le
  // fallback global (cf SettingsService) — un tenant client ne peut pas
  // taper sur l'app MDO Entra par defaut.
  {
    key: 'sso.enabled',
    category: 'sso',
    label: 'Activer le SSO (OIDC) pour ce tenant',
    description:
      'Si actif, les users peuvent se connecter via le bouton "Sign in with SSO" qui les redirige vers l\'IdP configure (Entra ID, Keycloak, Google Workspace, etc.). Le login local password reste possible pour les comptes sans ssoSubject lie.',
    defaultValue: 'false',
  },
  {
    key: 'sso.oidc.issuerUrl',
    category: 'sso',
    label: 'OIDC Issuer URL',
    description:
      'URL complete de l\'issuer (sera concatene avec /.well-known/openid-configuration pour la decouverte). Exemples : https://login.microsoftonline.com/<tenant-id>/v2.0 (Entra ID), https://keycloak.example.fr/realms/<realm> (Keycloak), https://accounts.google.com (Google).',
  },
  {
    key: 'sso.oidc.clientId',
    category: 'sso',
    label: 'OIDC Client ID',
    description: 'Identifiant de l\'application enregistree dans l\'IdP.',
  },
  {
    key: 'sso.oidc.clientSecret',
    category: 'sso',
    label: 'OIDC Client Secret',
    description: 'Secret client genere lors de l\'enregistrement de l\'app dans l\'IdP.',
    isSecret: true,
  },
  {
    key: 'sso.oidc.scopes',
    category: 'sso',
    label: 'Scopes OIDC demandes',
    description:
      'Liste de scopes separes par espace. Minimum : "openid email profile". Ajouter "offline_access" si vous voulez un refresh_token IdP.',
    defaultValue: 'openid email profile',
  },
  {
    key: 'sso.allowJitProvisioning',
    category: 'sso',
    label: 'Creation automatique des users (JIT)',
    description:
      'Si actif, un user qui se connecte via SSO et qui n\'existe pas encore en BDD est cree automatiquement (Just-In-Time) avec le role par defaut. Si inactif, seuls les users deja crees manuellement peuvent se connecter via SSO.',
    defaultValue: 'true',
  },
  {
    key: 'sso.defaultRole',
    category: 'sso',
    label: 'Role par defaut pour les users JIT',
    description: 'Role assigne aux users crees via JIT provisioning : ADMIN, MANAGER, SALES, READONLY. Recommandation : SALES (acces standard).',
    defaultValue: 'SALES',
  },
];

export function findSettingDef(key: string): SettingDef | undefined {
  return SETTINGS_DEFS.find((s) => s.key === key);
}
