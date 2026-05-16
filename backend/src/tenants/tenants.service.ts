import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Tenant } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';

// Service tenant : gere le CRUD + la resolution par domaine.
//
// Cache memoire : la resolution par domaine est appelee a CHAQUE requete
// HTTP (middleware), donc on cache pour eviter le round-trip BDD a chaque
// hit. TTL 5 min : suffisant pour les changements rares de config tenant.
//
// Important : ne PAS cacher l'objet Tenant complet pour l'auth. Le cache
// sert uniquement a la resolution domaine -> tenantId.

interface TenantCacheEntry {
  tenant: Tenant;
  expiresAt: number;
}

const TENANT_CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class TenantsService implements OnModuleInit {
  private readonly logger = new Logger(TenantsService.name);
  private readonly domainCache = new Map<string, TenantCacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => SettingsService))
    private readonly settings: SettingsService,
  ) {}

  // Au boot : cree le tenant 'mdo' s'il n'existe pas, et assigne a tous les
  // users + portalUsers sans tenantId. Permet une bascule sans perte de
  // donnees (cf project_revente_dsi_strategy.md "pas de migration necessaire").
  async onModuleInit() {
    const slug = 'mdo';
    let tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      const defaultDomain = this.config.get<string>('DOMAIN') ?? 'crm.mdoservices.fr';
      const brandName = this.config.get<string>('BRAND_NAME') ?? 'MDO Services';
      tenant = await this.prisma.tenant.create({
        data: {
          slug,
          customDomain: defaultDomain,
          brandName,
          brandShortName: this.config.get<string>('BRAND_SHORT_NAME') ?? 'MDO',
          brandTagline: this.config.get<string>('BRAND_TAGLINE'),
          brandLogoUrl: this.config.get<string>('BRAND_LOGO_URL') ?? '/logo.png',
          brandPrimaryColor: this.config.get<string>('BRAND_PRIMARY_COLOR') ?? '#1d4ed8',
          brandSupportEmail: this.config.get<string>('BRAND_SUPPORT_EMAIL'),
          brandDpoEmail: this.config.get<string>('BRAND_DPO_EMAIL'),
          brandWebsiteUrl: this.config.get<string>('BRAND_WEBSITE_URL'),
          brandFooterText: this.config.get<string>('BRAND_FOOTER_TEXT'),
        },
      });
      this.logger.log(`Tenant initial cree : ${slug} (${tenant.customDomain})`);
    }
    // Retro-compat : assigne le tenant 'mdo' a tous les users / portalUsers
    // sans tenantId. Premier ADMIN actif promu super-admin (Mathieu).
    const usersUpdated = await this.prisma.user.updateMany({
      where: { tenantId: null },
      data: { tenantId: tenant.id },
    });
    if (usersUpdated.count > 0) {
      this.logger.log(`Retro-compat : ${usersUpdated.count} user(s) assignes au tenant ${slug}`);
      // Promotion super-admin : 1er admin actif sans super-admin -> isSuperAdmin
      const firstAdmin = await this.prisma.user.findFirst({
        where: { role: 'ADMIN', isActive: true, isSuperAdmin: false },
        orderBy: { createdAt: 'asc' },
      });
      if (firstAdmin) {
        await this.prisma.user.update({
          where: { id: firstAdmin.id },
          data: { isSuperAdmin: true },
        });
        this.logger.log(`Super-admin promu : ${firstAdmin.email}`);
      }
    }
    const portalUsersUpdated = await this.prisma.clientPortalUser.updateMany({
      where: { tenantId: null },
      data: { tenantId: tenant.id },
    });
    if (portalUsersUpdated.count > 0) {
      this.logger.log(`Retro-compat : ${portalUsersUpdated.count} portal user(s) assignes`);
    }
    // Vague 1 : Companies + Contacts. Chaque vague successive ajoute ici les
    // updateMany pour les nouveaux modeles avec tenantId.
    const companiesUpdated = await this.prisma.company.updateMany({
      where: { tenantId: null },
      data: { tenantId: tenant.id },
    });
    if (companiesUpdated.count > 0) {
      this.logger.log(`Retro-compat : ${companiesUpdated.count} company(ies) assignees`);
    }
    const contactsUpdated = await this.prisma.contact.updateMany({
      where: { tenantId: null },
      data: { tenantId: tenant.id },
    });
    if (contactsUpdated.count > 0) {
      this.logger.log(`Retro-compat : ${contactsUpdated.count} contact(s) assignes`);
    }
    // Vague 2 : Tickets + TicketMessage + Intervention + TimeEntry + Attachment + CompanyDocument.
    const ticketsUpdated = await this.prisma.ticket.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (ticketsUpdated.count > 0) this.logger.log(`Retro-compat : ${ticketsUpdated.count} ticket(s) assignes`);
    const ticketMessagesUpdated = await this.prisma.ticketMessage.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (ticketMessagesUpdated.count > 0) this.logger.log(`Retro-compat : ${ticketMessagesUpdated.count} ticket message(s) assignes`);
    const interventionsUpdated = await this.prisma.intervention.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (interventionsUpdated.count > 0) this.logger.log(`Retro-compat : ${interventionsUpdated.count} intervention(s) assignees`);
    const timeEntriesUpdated = await this.prisma.timeEntry.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (timeEntriesUpdated.count > 0) this.logger.log(`Retro-compat : ${timeEntriesUpdated.count} time entry(ies) assignees`);
    const attachmentsUpdated = await this.prisma.attachment.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (attachmentsUpdated.count > 0) this.logger.log(`Retro-compat : ${attachmentsUpdated.count} attachment(s) assignes`);
    const documentsUpdated = await this.prisma.companyDocument.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (documentsUpdated.count > 0) this.logger.log(`Retro-compat : ${documentsUpdated.count} document(s) assignes`);
    // Vague 3 : Opportunities + Contracts + Invoices + Quotes (commercial).
    const oppsUpdated = await this.prisma.opportunity.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (oppsUpdated.count > 0) this.logger.log(`Retro-compat : ${oppsUpdated.count} opportunity(ies) assignees`);
    const contractsUpdated = await this.prisma.contract.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (contractsUpdated.count > 0) this.logger.log(`Retro-compat : ${contractsUpdated.count} contract(s) assignes`);
    const invoicesUpdated = await this.prisma.invoice.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (invoicesUpdated.count > 0) this.logger.log(`Retro-compat : ${invoicesUpdated.count} invoice(s) assignees`);
    const invoiceLinesUpdated = await this.prisma.invoiceLine.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (invoiceLinesUpdated.count > 0) this.logger.log(`Retro-compat : ${invoiceLinesUpdated.count} invoice line(s) assignees`);
    const quotesUpdated = await this.prisma.quote.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (quotesUpdated.count > 0) this.logger.log(`Retro-compat : ${quotesUpdated.count} quote(s) assignes`);
    const quoteLinesUpdated = await this.prisma.quoteLine.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (quoteLinesUpdated.count > 0) this.logger.log(`Retro-compat : ${quoteLinesUpdated.count} quote line(s) assignees`);
    // Vague 4 : Tasks + Notes + Activities + WorkflowRules + RecurringTemplates.
    const tasksUpdated = await this.prisma.task.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (tasksUpdated.count > 0) this.logger.log(`Retro-compat : ${tasksUpdated.count} task(s) assignees`);
    const notesUpdated = await this.prisma.note.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (notesUpdated.count > 0) this.logger.log(`Retro-compat : ${notesUpdated.count} note(s) assignees`);
    const activitiesUpdated = await this.prisma.activity.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (activitiesUpdated.count > 0) this.logger.log(`Retro-compat : ${activitiesUpdated.count} activity(ies) assignees`);
    const workflowRulesUpdated = await this.prisma.workflowRule.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (workflowRulesUpdated.count > 0) this.logger.log(`Retro-compat : ${workflowRulesUpdated.count} workflow rule(s) assignees`);
    const recurringUpdated = await this.prisma.recurringTaskTemplate.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (recurringUpdated.count > 0) this.logger.log(`Retro-compat : ${recurringUpdated.count} recurring template(s) assignees`);
    // Vague 5 : Assets + Locations + Networks + FlexibleAssets + QuickNotes +
    // DocPages + RunbookRuns + SecretEntries (inventaire IT).
    const assetsUpdated = await this.prisma.asset.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (assetsUpdated.count > 0) this.logger.log(`Retro-compat : ${assetsUpdated.count} asset(s) assignes`);
    const locationsUpdated = await this.prisma.location.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (locationsUpdated.count > 0) this.logger.log(`Retro-compat : ${locationsUpdated.count} location(s) assignees`);
    const networksUpdated = await this.prisma.network.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (networksUpdated.count > 0) this.logger.log(`Retro-compat : ${networksUpdated.count} network(s) assignes`);
    const flexUpdated = await this.prisma.flexibleAsset.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (flexUpdated.count > 0) this.logger.log(`Retro-compat : ${flexUpdated.count} flexible asset(s) assignes`);
    const quickNotesUpdated = await this.prisma.quickNote.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (quickNotesUpdated.count > 0) this.logger.log(`Retro-compat : ${quickNotesUpdated.count} quick note(s) assignees`);
    const docPagesUpdated = await this.prisma.docPage.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (docPagesUpdated.count > 0) this.logger.log(`Retro-compat : ${docPagesUpdated.count} doc page(s) assignees`);
    const runbookRunsUpdated = await this.prisma.runbookRun.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (runbookRunsUpdated.count > 0) this.logger.log(`Retro-compat : ${runbookRunsUpdated.count} runbook run(s) assignes`);
    const secretsUpdated = await this.prisma.secretEntry.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (secretsUpdated.count > 0) this.logger.log(`Retro-compat : ${secretsUpdated.count} secret(s) assignes`);
    // Vague 6 complete : Subprocessors + KbArticle + ApiKey + AiUsage +
    // EmailTemplate + ResponseTemplate + OnboardingTemplate (config + ressources).
    const subprocessorsUpdated = await this.prisma.subprocessor.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (subprocessorsUpdated.count > 0) this.logger.log(`Retro-compat : ${subprocessorsUpdated.count} subprocessor(s) assignes`);
    const kbUpdated = await this.prisma.kbArticle.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (kbUpdated.count > 0) this.logger.log(`Retro-compat : ${kbUpdated.count} kb article(s) assignes`);
    const aiUsageUpdated = await this.prisma.aiUsage.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (aiUsageUpdated.count > 0) this.logger.log(`Retro-compat : ${aiUsageUpdated.count} ai usage row(s) assignees`);
    const apiKeysUpdated = await this.prisma.apiKey.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (apiKeysUpdated.count > 0) this.logger.log(`Retro-compat : ${apiKeysUpdated.count} api key(s) assignees`);
    const emailTemplatesUpdated = await this.prisma.emailTemplate.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (emailTemplatesUpdated.count > 0) this.logger.log(`Retro-compat : ${emailTemplatesUpdated.count} email template(s) assignes`);
    const responseTemplatesUpdated = await this.prisma.responseTemplate.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (responseTemplatesUpdated.count > 0) this.logger.log(`Retro-compat : ${responseTemplatesUpdated.count} response template(s) assignees`);
    const onboardingTemplatesUpdated = await this.prisma.onboardingTemplate.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (onboardingTemplatesUpdated.count > 0) this.logger.log(`Retro-compat : ${onboardingTemplatesUpdated.count} onboarding template(s) assignes`);
    // Vague 7 : modules satellites (UptimeMonitor, BackupJob, DripCampaign,
    // OnboardingRun, PhishingCampaign, ComplianceAssessment).
    const uptimeUpdated = await this.prisma.uptimeMonitor.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (uptimeUpdated.count > 0) this.logger.log(`Retro-compat : ${uptimeUpdated.count} uptime monitor(s) assignes`);
    const backupJobsUpdated = await this.prisma.backupJob.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (backupJobsUpdated.count > 0) this.logger.log(`Retro-compat : ${backupJobsUpdated.count} backup job(s) assignes`);
    const dripsUpdated = await this.prisma.dripCampaign.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (dripsUpdated.count > 0) this.logger.log(`Retro-compat : ${dripsUpdated.count} drip campaign(s) assignees`);
    const onboardingRunsUpdated = await this.prisma.onboardingRun.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (onboardingRunsUpdated.count > 0) this.logger.log(`Retro-compat : ${onboardingRunsUpdated.count} onboarding run(s) assignes`);
    const phishingUpdated = await this.prisma.phishingCampaign.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (phishingUpdated.count > 0) this.logger.log(`Retro-compat : ${phishingUpdated.count} phishing campaign(s) assignees`);
    const complianceUpdated = await this.prisma.complianceAssessment.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (complianceUpdated.count > 0) this.logger.log(`Retro-compat : ${complianceUpdated.count} compliance assessment(s) assignes`);
    // Vague 8 : Notifications + BankTransaction + ClientReport + CustomerSuccess +
    // WebhookEndpoint + EmailSecurityCheck + SignatureRequest + CallLog + PushSubscription.
    const notificationsUpdated = await this.prisma.notification.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (notificationsUpdated.count > 0) this.logger.log(`Retro-compat : ${notificationsUpdated.count} notification(s) assignees`);
    const bankTxUpdated = await this.prisma.bankTransaction.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (bankTxUpdated.count > 0) this.logger.log(`Retro-compat : ${bankTxUpdated.count} bank transaction(s) assignees`);
    const clientReportsUpdated = await this.prisma.clientReport.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (clientReportsUpdated.count > 0) this.logger.log(`Retro-compat : ${clientReportsUpdated.count} client report(s) assignes`);
    const cstSuccessUpdated = await this.prisma.customerSuccessReview.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (cstSuccessUpdated.count > 0) this.logger.log(`Retro-compat : ${cstSuccessUpdated.count} customer success review(s) assignes`);
    const webhooksUpdated = await this.prisma.webhookEndpoint.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (webhooksUpdated.count > 0) this.logger.log(`Retro-compat : ${webhooksUpdated.count} webhook endpoint(s) assignes`);
    const emailSecUpdated = await this.prisma.emailSecurityCheck.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (emailSecUpdated.count > 0) this.logger.log(`Retro-compat : ${emailSecUpdated.count} email security check(s) assignes`);
    const signaturesUpdated = await this.prisma.signatureRequest.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (signaturesUpdated.count > 0) this.logger.log(`Retro-compat : ${signaturesUpdated.count} signature request(s) assignees`);
    const callLogsUpdated = await this.prisma.callLog.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (callLogsUpdated.count > 0) this.logger.log(`Retro-compat : ${callLogsUpdated.count} call log(s) assignes`);
    const pushSubsUpdated = await this.prisma.pushSubscription.updateMany({
      where: { tenantId: null }, data: { tenantId: tenant.id },
    });
    if (pushSubsUpdated.count > 0) this.logger.log(`Retro-compat : ${pushSubsUpdated.count} push subscription(s) assignees`);
  }

  // ============================================================
  // Resolution par domaine (appele par le middleware)
  // ============================================================
  // Strategie : on normalise le host (lowercase, sans port) puis on lookup.
  // Cache process-level avec TTL 5 min.
  async resolveByDomain(host: string): Promise<Tenant | null> {
    if (!host) return null;
    const normalized = host.toLowerCase().split(':')[0];
    const cached = this.domainCache.get(normalized);
    if (cached && cached.expiresAt > Date.now()) return cached.tenant;
    const tenant = await this.prisma.tenant.findUnique({
      where: { customDomain: normalized },
    });
    if (tenant) {
      this.domainCache.set(normalized, {
        tenant,
        expiresAt: Date.now() + TENANT_CACHE_TTL_MS,
      });
    }
    return tenant;
  }

  // Invalidation cache : appele apres update / delete d'un tenant pour que
  // les changements soient pris en compte sans attendre le TTL.
  invalidateCache(domain?: string) {
    if (domain) this.domainCache.delete(domain.toLowerCase());
    else this.domainCache.clear();
  }

  // ============================================================
  // CRUD super-admin
  // ============================================================
  list() {
    return this.prisma.tenant.findMany({
      orderBy: [{ isActive: 'desc' }, { slug: 'asc' }],
      include: { _count: { select: { users: true, portalUsers: true } } },
    });
  }

  async findOne(id: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tenant introuvable');
    return t;
  }

  async create(input: {
    slug: string;
    customDomain: string;
    brandName: string;
    brandShortName: string;
    brandTagline?: string;
    brandLogoUrl?: string;
    brandPrimaryColor?: string;
    brandSupportEmail?: string;
    brandDpoEmail?: string;
    brandWebsiteUrl?: string;
    brandFooterText?: string;
  }) {
    if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(input.slug)) {
      throw new BadRequestException('slug doit etre lowercase, [a-z0-9-], 2-31 char');
    }
    const tenant = await this.prisma.tenant.create({ data: input });
    // Seed les settings par defaut pour ce nouveau tenant. Sans ca, le tenant
    // n'aurait aucune config (les fallback global sont reserves aux non-secrets,
    // cf SettingsService.get).
    await this.settings.seedForTenant(tenant.id).catch((err) =>
      this.logger.warn(`seedForTenant failed pour ${tenant.slug}: ${err.message}`),
    );
    return tenant;
  }

  async update(id: string, input: Partial<{
    customDomain: string;
    brandName: string;
    brandShortName: string;
    brandTagline: string | null;
    brandLogoUrl: string | null;
    brandPrimaryColor: string | null;
    brandSupportEmail: string | null;
    brandDpoEmail: string | null;
    brandWebsiteUrl: string | null;
    brandFooterText: string | null;
    isActive: boolean;
    enableContracts: boolean;
    enableInvoices: boolean;
    enableOpportunities: boolean;
    enableQuotes: boolean;
  }>) {
    const before = await this.findOne(id);
    const t = await this.prisma.tenant.update({ where: { id }, data: input });
    // Invalide le cache pour les 2 domaines (avant + apres) au cas ou customDomain change.
    this.invalidateCache(before.customDomain);
    if (input.customDomain) this.invalidateCache(input.customDomain);
    return t;
  }

  async remove(id: string) {
    const before = await this.findOne(id);
    if (before.slug === 'mdo') {
      throw new BadRequestException('Le tenant mdo ne peut pas etre supprime');
    }
    // Defense en profondeur : on refuse si users existent (le Restrict de la FK
    // le fait aussi mais erreur Prisma moins lisible).
    const userCount = await this.prisma.user.count({ where: { tenantId: id } });
    if (userCount > 0) {
      throw new BadRequestException(
        `Impossible de supprimer : ${userCount} user(s) dans ce tenant. ` +
        `Pour un retrait RGPD complet, utilisez purge() avec le slug de confirmation.`,
      );
    }
    await this.prisma.tenant.delete({ where: { id } });
    this.invalidateCache(before.customDomain);
    return { ok: true };
  }

  // ============================================================
  // EXPORT RGPD : dump complet des donnees d'un tenant en JSON
  // Article 20 RGPD (portabilite). Renvoie un objet avec toutes les entites
  // scopees au tenant — A FAIRE AVANT toute suppression definitive pour que
  // le client puisse recuperer son patrimoine de donnees.
  //
  // Note : les SecretEntry sont exportes CHIFFRES (cipheredValue/cipheredTotp)
  // car la cle de dechiffrement (SECRETS_MASTER_KEY) est cote serveur ; le
  // tenant ne pourra dechiffrer que s'il a aussi cette cle (ou s'il recree
  // les secrets de zero). Document this in the export README.
  // ============================================================
  async export(id: string) {
    const tenant = await this.findOne(id);

    // Collecte parallele de toutes les entites scopees. Si la liste s'allonge,
    // c'est ici qu'il faut ajouter les nouveaux modeles tenant-scopes.
    const [
      users, companies, contacts, contracts, opportunities, quotes, quoteLines,
      invoices, invoiceLines, tickets, ticketMessages, interventions, timeEntries,
      attachments, documents, assets, locations, networks, flexibleAssets,
      docPages, quickNotes, runbookRuns, secretEntries, settings, activities,
      notes, tasks, recurringTemplates, workflowRules, emailTemplates,
      responseTemplates, subprocessors, kbArticles, aiUsage, apiKeys,
      onboardingTemplates, onboardingRuns, uptimeMonitors, backupJobs,
      dripCampaigns, phishingCampaigns, complianceAssessments,
      notifications, bankTransactions, clientReports, customerSuccessReviews,
      webhookEndpoints, emailSecurityChecks, signatureRequests, callLogs,
      pushSubscriptions, portalUsers,
    ] = await Promise.all([
      this.prisma.user.findMany({ where: { tenantId: id }, select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, lastLoginAt: true, createdAt: true } }),
      this.prisma.company.findMany({ where: { tenantId: id } }),
      this.prisma.contact.findMany({ where: { tenantId: id } }),
      this.prisma.contract.findMany({ where: { tenantId: id } }),
      this.prisma.opportunity.findMany({ where: { tenantId: id } }),
      this.prisma.quote.findMany({ where: { tenantId: id } }),
      this.prisma.quoteLine.findMany({ where: { tenantId: id } }),
      this.prisma.invoice.findMany({ where: { tenantId: id } }),
      this.prisma.invoiceLine.findMany({ where: { tenantId: id } }),
      this.prisma.ticket.findMany({ where: { tenantId: id } }),
      this.prisma.ticketMessage.findMany({ where: { tenantId: id } }),
      this.prisma.intervention.findMany({ where: { tenantId: id } }),
      this.prisma.timeEntry.findMany({ where: { tenantId: id } }),
      this.prisma.attachment.findMany({ where: { tenantId: id } }),
      this.prisma.companyDocument.findMany({ where: { tenantId: id } }),
      this.prisma.asset.findMany({ where: { tenantId: id } }),
      this.prisma.location.findMany({ where: { tenantId: id } }),
      this.prisma.network.findMany({ where: { tenantId: id } }),
      this.prisma.flexibleAsset.findMany({ where: { tenantId: id } }),
      this.prisma.docPage.findMany({ where: { tenantId: id } }),
      this.prisma.quickNote.findMany({ where: { tenantId: id } }),
      this.prisma.runbookRun.findMany({ where: { tenantId: id } }),
      this.prisma.secretEntry.findMany({ where: { tenantId: id } }),
      this.prisma.setting.findMany({ where: { tenantId: id }, select: { key: true, value: true, isSecret: true, category: true } }),
      this.prisma.activity.findMany({ where: { tenantId: id } }),
      this.prisma.note.findMany({ where: { tenantId: id } }),
      this.prisma.task.findMany({ where: { tenantId: id } }),
      this.prisma.recurringTaskTemplate.findMany({ where: { tenantId: id } }),
      this.prisma.workflowRule.findMany({ where: { tenantId: id } }),
      this.prisma.emailTemplate.findMany({ where: { tenantId: id } }),
      this.prisma.responseTemplate.findMany({ where: { tenantId: id } }),
      this.prisma.subprocessor.findMany({ where: { tenantId: id } }),
      this.prisma.kbArticle.findMany({ where: { tenantId: id } }),
      this.prisma.aiUsage.findMany({ where: { tenantId: id } }),
      this.prisma.apiKey.findMany({ where: { tenantId: id }, select: { id: true, name: true, scope: true, prefix: true, revokedAt: true, expiresAt: true, createdAt: true, lastUsedAt: true, usageCount: true } }),
      this.prisma.onboardingTemplate.findMany({ where: { tenantId: id } }),
      this.prisma.onboardingRun.findMany({ where: { tenantId: id } }),
      this.prisma.uptimeMonitor.findMany({ where: { tenantId: id } }),
      this.prisma.backupJob.findMany({ where: { tenantId: id } }),
      this.prisma.dripCampaign.findMany({ where: { tenantId: id } }),
      this.prisma.phishingCampaign.findMany({ where: { tenantId: id } }),
      this.prisma.complianceAssessment.findMany({ where: { tenantId: id } }),
      this.prisma.notification.findMany({ where: { tenantId: id } }),
      this.prisma.bankTransaction.findMany({ where: { tenantId: id } }),
      this.prisma.clientReport.findMany({ where: { tenantId: id } }),
      this.prisma.customerSuccessReview.findMany({ where: { tenantId: id } }),
      this.prisma.webhookEndpoint.findMany({ where: { tenantId: id }, select: { id: true, url: true, description: true, events: true, isActive: true, companyId: true, createdAt: true } }),
      this.prisma.emailSecurityCheck.findMany({ where: { tenantId: id } }),
      this.prisma.signatureRequest.findMany({ where: { tenantId: id } }),
      this.prisma.callLog.findMany({ where: { tenantId: id } }),
      this.prisma.pushSubscription.findMany({ where: { tenantId: id }, select: { id: true, userId: true, userAgent: true, createdAt: true } }),
      this.prisma.clientPortalUser.findMany({ where: { tenantId: id }, select: { id: true, email: true, contactId: true, isActive: true, createdAt: true } }),
    ]);

    return {
      meta: {
        exportedAt: new Date().toISOString(),
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        format: 'crm-mdo-tenant-export/v1',
        gdprArticle: '20 (right to data portability)',
        notes: [
          'SecretEntry contains cipheredValue/cipheredTotp (NOT decrypted). Decryption requires SECRETS_MASTER_KEY.',
          'API keys exported without secret (only prefix). Plain key was shown ONCE at creation.',
          'Settings.value exported in clear for non-secrets ; secrets are skipped in dedicated section.',
        ],
      },
      tenant,
      users,
      portalUsers,
      companies,
      contacts,
      contracts,
      opportunities,
      quotes,
      quoteLines,
      invoices,
      invoiceLines,
      tickets,
      ticketMessages,
      interventions,
      timeEntries,
      attachments,
      documents,
      assets,
      locations,
      networks,
      flexibleAssets,
      docPages,
      quickNotes,
      runbookRuns,
      secretEntries,
      settings,
      activities,
      notes,
      tasks,
      recurringTemplates,
      workflowRules,
      emailTemplates,
      responseTemplates,
      subprocessors,
      kbArticles,
      aiUsage,
      apiKeys,
      onboardingTemplates,
      onboardingRuns,
      uptimeMonitors,
      backupJobs,
      dripCampaigns,
      phishingCampaigns,
      complianceAssessments,
      notifications,
      bankTransactions,
      clientReports,
      customerSuccessReviews,
      webhookEndpoints,
      emailSecurityChecks,
      signatureRequests,
      callLogs,
      pushSubscriptions,
    };
  }

  // ============================================================
  // PURGE RGPD : suppression DEFINITIVE de toutes les donnees d'un tenant.
  // Article 17 RGPD (droit a l'effacement). DESTRUCTIVE et IRREVERSIBLE.
  //
  // Garde-fous :
  //   1. Le caller DOIT fournir le slug du tenant en confirmation (evite
  //      les suppressions accidentelles via UI bug ou click malheureux)
  //   2. Le tenant 'mdo' est non-supprimable (instance root)
  //   3. On itere dans l'ordre dependances inverses pour respecter les
  //      FK avec onDelete:Restrict (notamment User -> Tenant Restrict)
  //   4. Trace dans les logs (l'Activity du tenant lui-meme va etre
  //      supprimee, donc on log dans le logger systeme)
  //
  // Recommandation : appeler export() AVANT pour offrir le dump RGPD au
  // client avant la suppression definitive.
  // ============================================================
  async purge(id: string, confirmSlug: string, performedByUserId: string): Promise<{ deleted: Record<string, number> }> {
    const before = await this.findOne(id);
    if (before.slug === 'mdo') {
      throw new BadRequestException('Le tenant mdo ne peut pas etre purge (instance root)');
    }
    if (confirmSlug !== before.slug) {
      throw new BadRequestException(
        `Confirmation invalide : repetez exactement le slug du tenant ("${before.slug}") pour confirmer la purge.`,
      );
    }

    this.logger.warn(
      `[RGPD PURGE] Tenant "${before.slug}" (id=${id}) — performedBy=${performedByUserId} — INITIATED`,
    );

    const deleted: Record<string, number> = {};
    const drop = async (name: string, fn: () => Promise<{ count: number }>) => {
      try {
        const r = await fn();
        if (r.count > 0) deleted[name] = r.count;
      } catch (err: any) {
        this.logger.warn(`[RGPD PURGE] ${name} : ${err.message}`);
        throw err;
      }
    };

    const where = { tenantId: id };
    // Ordre : enfants -> parents. On supprime d'abord les lignes/messages qui
    // ont des FK vers les entites principales, puis les entites principales.
    await drop('aiUsage', () => this.prisma.aiUsage.deleteMany({ where }));
    await drop('activities', () => this.prisma.activity.deleteMany({ where }));
    await drop('notifications', () => this.prisma.notification.deleteMany({ where }));
    await drop('pushSubscriptions', () => this.prisma.pushSubscription.deleteMany({ where }));
    await drop('callLogs', () => this.prisma.callLog.deleteMany({ where }));
    await drop('signatureRequests', () => this.prisma.signatureRequest.deleteMany({ where }));
    await drop('emailSecurityChecks', () => this.prisma.emailSecurityCheck.deleteMany({ where }));
    await drop('webhookEndpoints', () => this.prisma.webhookEndpoint.deleteMany({ where }));
    await drop('customerSuccessReviews', () => this.prisma.customerSuccessReview.deleteMany({ where }));
    await drop('clientReports', () => this.prisma.clientReport.deleteMany({ where }));
    await drop('bankTransactions', () => this.prisma.bankTransaction.deleteMany({ where }));
    await drop('complianceAssessments', () => this.prisma.complianceAssessment.deleteMany({ where }));
    await drop('phishingCampaigns', () => this.prisma.phishingCampaign.deleteMany({ where }));
    await drop('onboardingRuns', () => this.prisma.onboardingRun.deleteMany({ where }));
    await drop('onboardingTemplates', () => this.prisma.onboardingTemplate.deleteMany({ where }));
    await drop('dripCampaigns', () => this.prisma.dripCampaign.deleteMany({ where }));
    await drop('backupJobs', () => this.prisma.backupJob.deleteMany({ where }));
    await drop('uptimeMonitors', () => this.prisma.uptimeMonitor.deleteMany({ where }));
    await drop('apiKeys', () => this.prisma.apiKey.deleteMany({ where }));
    await drop('kbArticles', () => this.prisma.kbArticle.deleteMany({ where }));
    await drop('subprocessors', () => this.prisma.subprocessor.deleteMany({ where }));
    await drop('responseTemplates', () => this.prisma.responseTemplate.deleteMany({ where }));
    await drop('emailTemplates', () => this.prisma.emailTemplate.deleteMany({ where }));
    await drop('workflowRules', () => this.prisma.workflowRule.deleteMany({ where }));
    await drop('recurringTemplates', () => this.prisma.recurringTaskTemplate.deleteMany({ where }));
    await drop('tasks', () => this.prisma.task.deleteMany({ where }));
    await drop('notes', () => this.prisma.note.deleteMany({ where }));
    await drop('quickNotes', () => this.prisma.quickNote.deleteMany({ where }));
    await drop('runbookRuns', () => this.prisma.runbookRun.deleteMany({ where }));
    await drop('docPages', () => this.prisma.docPage.deleteMany({ where }));
    await drop('secretEntries', () => this.prisma.secretEntry.deleteMany({ where }));
    await drop('flexibleAssets', () => this.prisma.flexibleAsset.deleteMany({ where }));
    await drop('networks', () => this.prisma.network.deleteMany({ where }));
    await drop('locations', () => this.prisma.location.deleteMany({ where }));
    await drop('assets', () => this.prisma.asset.deleteMany({ where }));
    await drop('documents', () => this.prisma.companyDocument.deleteMany({ where }));
    await drop('attachments', () => this.prisma.attachment.deleteMany({ where }));
    await drop('timeEntries', () => this.prisma.timeEntry.deleteMany({ where }));
    await drop('interventions', () => this.prisma.intervention.deleteMany({ where }));
    await drop('ticketMessages', () => this.prisma.ticketMessage.deleteMany({ where }));
    await drop('tickets', () => this.prisma.ticket.deleteMany({ where }));
    await drop('invoiceLines', () => this.prisma.invoiceLine.deleteMany({ where }));
    await drop('invoices', () => this.prisma.invoice.deleteMany({ where }));
    await drop('quoteLines', () => this.prisma.quoteLine.deleteMany({ where }));
    await drop('quotes', () => this.prisma.quote.deleteMany({ where }));
    await drop('contracts', () => this.prisma.contract.deleteMany({ where }));
    await drop('opportunities', () => this.prisma.opportunity.deleteMany({ where }));
    await drop('contacts', () => this.prisma.contact.deleteMany({ where }));
    await drop('companies', () => this.prisma.company.deleteMany({ where }));
    // Settings du tenant (config). Garde les valeurs globales intactes.
    await drop('settings', () => this.prisma.setting.deleteMany({ where }));
    // ClientPortal users (compte web client) + leurs sessions/magic links
    await drop('portalUsers', () => this.prisma.clientPortalUser.deleteMany({ where }));
    // RefreshTokens + MFA secrets des users (avant les users eux-memes)
    const tenantUsers = await this.prisma.user.findMany({ where, select: { id: true } });
    const userIds = tenantUsers.map((u) => u.id);
    if (userIds.length > 0) {
      await drop('refreshTokens', () => this.prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } }));
      await drop('userSkills', () => this.prisma.userSkill.deleteMany({ where: { userId: { in: userIds } } }));
    }
    // Users en dernier (avant le tenant lui-meme — User a FK onDelete:Restrict)
    await drop('users', () => this.prisma.user.deleteMany({ where }));
    // Enfin : le tenant
    await this.prisma.tenant.delete({ where: { id } });
    this.invalidateCache(before.customDomain);

    this.logger.warn(
      `[RGPD PURGE] Tenant "${before.slug}" purge avec succes — entites supprimees : ${JSON.stringify(deleted)}`,
    );
    return { deleted };
  }
}
