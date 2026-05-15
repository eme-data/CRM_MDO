import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';

export type HealthSeverity = 'info' | 'warning' | 'error';

export interface HealthCheck {
  category: string;
  key: string;
  label: string;
  status: 'ok' | HealthSeverity;
  message: string;
  fixHint?: string;
  fixUrl?: string;
}

@Injectable()
export class SystemHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  // ============================================================
  // Global health check : retourne la liste de tous les checks
  // (OK et issues), groupes par categorie cote UI.
  // ============================================================
  async check(): Promise<{
    issues: number;
    warnings: number;
    checks: HealthCheck[];
  }> {
    const checks: HealthCheck[] = [];

    // ----- SMTP -----
    const smtpHost = await this.settings.get('smtp.host');
    const smtpUser = await this.settings.get('smtp.user');
    if (!smtpHost) {
      checks.push({
        category: 'Email', key: 'smtp.host', label: 'SMTP non configure',
        status: 'error',
        message: 'Aucun envoi d\'email possible (alertes contrats, NPS, rapports clients, magic links portail).',
        fixHint: 'Configurez smtp.host + smtp.user + smtp.password',
        fixUrl: '/admin/settings',
      });
    } else if (!smtpUser) {
      checks.push({
        category: 'Email', key: 'smtp.user', label: 'SMTP user manquant',
        status: 'warning',
        message: 'Host configure mais pas de user. La plupart des serveurs SMTP exigent une auth.',
        fixUrl: '/admin/settings',
      });
    } else {
      checks.push({ category: 'Email', key: 'smtp', label: 'SMTP', status: 'ok', message: 'Configure (' + smtpHost + ')' });
    }

    // ----- IMAP (mail-inbound) -----
    const imapEnabled = await this.settings.get('inbound.enabled') ?? process.env.INBOUND_EMAIL_ENABLED;
    if (imapEnabled === 'true') {
      const imapHost = await this.settings.get('imap.host');
      if (!imapHost) {
        checks.push({
          category: 'Email', key: 'imap.host', label: 'IMAP active mais non configure',
          status: 'error',
          message: 'INBOUND_EMAIL_ENABLED=true mais imap.host vide — les emails entrants ne seront pas captures.',
          fixUrl: '/admin/settings',
        });
      } else {
        checks.push({ category: 'Email', key: 'imap', label: 'IMAP entrant', status: 'ok', message: 'Configure (' + imapHost + ')' });
      }
    }

    // ----- IA Claude -----
    const aiEnabled = await this.settings.getBool('ai.enabled');
    const aiKey = await this.settings.get('ai.apiKey');
    if (aiEnabled && !aiKey) {
      checks.push({
        category: 'IA', key: 'ai.apiKey', label: 'IA active sans cle API',
        status: 'error',
        message: 'ai.enabled=true mais cle Anthropic absente — toutes les fonctions IA echoueront.',
        fixHint: 'Soit configurer ai.apiKey, soit desactiver ai.enabled',
        fixUrl: '/admin/settings',
      });
    } else if (!aiEnabled) {
      checks.push({
        category: 'IA', key: 'ai.enabled', label: 'IA desactivee',
        status: 'info',
        message: 'Triage tickets, draft reponses, resume client : non disponibles.',
        fixUrl: '/admin/settings',
      });
    } else {
      checks.push({ category: 'IA', key: 'ai', label: 'Claude API', status: 'ok', message: 'Configure' });
    }

    // ----- OpenAI Whisper -----
    const transcribeAuto = await this.settings.getBool('ai.transcribeCallsAuto');
    const openaiKey = await this.settings.get('ai.openaiApiKey');
    if (transcribeAuto && !openaiKey) {
      checks.push({
        category: 'IA', key: 'ai.openaiApiKey', label: 'Transcription auto sans cle OpenAI',
        status: 'error',
        message: 'ai.transcribeCallsAuto=true mais ai.openaiApiKey absente — Whisper ne tournera pas.',
        fixUrl: '/admin/settings',
      });
    }

    // ----- Push notifications (VAPID) -----
    const vapidPub = await this.settings.get('push.vapidPublicKey');
    if (!vapidPub) {
      checks.push({
        category: 'Push', key: 'push.vapidPublicKey', label: 'Web Push non initialise',
        status: 'warning',
        message: 'Aucune notification push navigateur ne peut etre envoyee.',
        fixHint: 'Cliquer "Generer cles VAPID" dans les settings (action one-shot)',
        fixUrl: '/admin/settings',
      });
    } else {
      checks.push({ category: 'Push', key: 'push.vapid', label: 'VAPID', status: 'ok', message: 'Cles generees' });
    }

    // ----- Signature electronique -----
    const sigProvider = await this.settings.get('signature.provider');
    if (sigProvider && sigProvider !== 'DISABLED') {
      const apiKeyKey = sigProvider === 'YOUSIGN' ? 'signature.yousign.apiKey' : 'signature.docuseal.apiKey';
      const apiKey = await this.settings.get(apiKeyKey);
      if (!apiKey) {
        checks.push({
          category: 'Signature', key: apiKeyKey, label: 'Signature electronique non utilisable',
          status: 'error',
          message: 'Provider ' + sigProvider + ' selectionne mais apiKey absente.',
          fixUrl: '/admin/settings',
        });
      } else {
        checks.push({ category: 'Signature', key: 'signature', label: sigProvider, status: 'ok', message: 'Configure' });
      }
    }

    // ----- VoIP -----
    const voipProvider = await this.settings.get('voip.provider');
    if (voipProvider === 'FREE_PRO') {
      const apiKey = await this.settings.get('voip.freepro.apiKey');
      if (!apiKey) {
        checks.push({
          category: 'VoIP', key: 'voip.freepro.apiKey', label: 'Free PRO selectionne sans cle API',
          status: 'warning',
          message: 'Le click-to-call retombe sur tel: URI uniquement.',
          fixUrl: '/admin/settings',
        });
      }
    }

    // ----- M365 -----
    const m365ClientId = await this.settings.get('m365.clientId');
    if (!m365ClientId) {
      checks.push({
        category: 'Integrations', key: 'm365.clientId', label: 'Microsoft 365 / Graph non configure',
        status: 'info',
        message: 'Sync Secure Score, devices Intune et alertes Defender desactives.',
        fixUrl: '/admin/settings',
      });
    } else {
      checks.push({ category: 'Integrations', key: 'm365', label: 'M365 Graph', status: 'ok', message: 'Configure' });
    }

    // ----- Pappers / Sirene -----
    const pappersKey = await this.settings.get('lookup.pappersApiKey');
    const sireneKey = await this.settings.get('lookup.sireneApiKey');
    if (!pappersKey && !sireneKey) {
      checks.push({
        category: 'Annuaire', key: 'lookup', label: 'Aucun annuaire entreprises',
        status: 'info',
        message: 'Saisie manuelle uniquement (pas d\'auto-completion SIREN).',
        fixUrl: '/admin/settings',
      });
    } else {
      checks.push({ category: 'Annuaire', key: 'lookup', label: 'Annuaire', status: 'ok', message: (pappersKey ? 'Pappers ' : '') + (sireneKey ? 'Sirene ' : '') });
    }

    // ----- Backups : verif qu'on a au moins 1 backup recent -----
    const lastBackup = await this.prisma.systemBackup.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastBackup) {
      checks.push({
        category: 'Backup', key: 'lastBackup', label: 'Aucun backup interne',
        status: 'warning',
        message: 'Pas de snapshot CRM disponible. Le cron 02:30 va en creer un.',
        fixUrl: '/admin/system-backup',
      });
    } else {
      const ageDays = Math.floor((Date.now() - lastBackup.createdAt.getTime()) / 86400_000);
      if (ageDays > 2) {
        checks.push({
          category: 'Backup', key: 'lastBackup', label: 'Dernier backup ancien',
          status: 'warning',
          message: 'Dernier backup il y a ' + ageDays + ' jours. Verifier le cron.',
          fixUrl: '/admin/system-backup',
        });
      } else {
        checks.push({ category: 'Backup', key: 'lastBackup', label: 'Backup', status: 'ok', message: 'OK il y a ' + ageDays + ' jour(s)' });
      }
    }

    // ----- ADMIN sans MFA active -----
    const adminWithoutMfa = await this.prisma.user.count({
      where: { role: 'ADMIN', isActive: true, mfa: { is: null } },
    });
    if (adminWithoutMfa > 0) {
      checks.push({
        category: 'Securite', key: 'admin-mfa', label: adminWithoutMfa + ' ADMIN sans 2FA',
        status: 'error',
        message: 'Compromis ADMIN sans MFA = compromission totale. Activer obligatoirement.',
        fixUrl: '/users',
      });
    } else {
      checks.push({ category: 'Securite', key: 'admin-mfa', label: 'MFA ADMIN', status: 'ok', message: 'Tous les ADMIN ont MFA active' });
    }

    const issues = checks.filter((c) => c.status === 'error').length;
    const warnings = checks.filter((c) => c.status === 'warning').length;
    return { issues, warnings, checks };
  }

  // ============================================================
  // Endpoint leger pour le bandeau header (just count)
  // ============================================================
  async summary(): Promise<{ issues: number; warnings: number }> {
    const r = await this.check();
    return { issues: r.issues, warnings: r.warnings };
  }
}
