import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { SettingsService } from '../settings/settings.service';
import { M365GraphClient } from './m365-graph.client';

// Mapping interne SkuPartNumber -> libelle humain pour les licences les plus
// communes. Liste non exhaustive — Graph retourne le SkuPartNumber dans la
// reponse, on traduit cote affichage pour la lisibilite.
const SKU_LABELS: Record<string, string> = {
  ENTERPRISEPACK: 'Office 365 E3',
  ENTERPRISEPREMIUM: 'Office 365 E5',
  STANDARDPACK: 'Office 365 E1',
  SPB: 'Microsoft 365 Business Premium',
  SMB_BUSINESS_PREMIUM: 'Microsoft 365 Business Premium',
  O365_BUSINESS_PREMIUM: 'Microsoft 365 Business Standard',
  O365_BUSINESS_ESSENTIALS: 'Microsoft 365 Business Basic',
  EMS: 'Enterprise Mobility + Security E3',
  EMSPREMIUM: 'Enterprise Mobility + Security E5',
  EXCHANGESTANDARD: 'Exchange Online Plan 1',
  EXCHANGEENTERPRISE: 'Exchange Online Plan 2',
  AAD_PREMIUM: 'Microsoft Entra ID P1',
  AAD_PREMIUM_P2: 'Microsoft Entra ID P2',
  MCOSTANDARD: 'Skype for Business Online (Plan 2)',
  TEAMS_EXPLORATORY: 'Teams Exploratory',
  POWER_BI_PRO: 'Power BI Pro',
  FLOW_FREE: 'Power Automate Free',
};

@Injectable()
export class M365Service {
  private readonly logger = new Logger(M365Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
    private readonly settings: SettingsService,
    private readonly graph: M365GraphClient,
  ) {}

  // ============================================================
  // Configuration : credentials de l'app M365 PAR TENANT CRM. Chaque tenant
  // (MDO, Mairie de Seysses) a sa propre app registration Azure et donne
  // SES propres autorisations admin-consent dans son tenant Microsoft.
  // ============================================================
  private async getAppCredentials(crmTenantId: string | null = null): Promise<{ clientId: string; clientSecret: string }> {
    const clientId = await this.settings.get('m365.clientId', crmTenantId);
    const clientSecret = await this.settings.get('m365.clientSecret', crmTenantId);
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        "L'application Microsoft 365 n'est pas configuree. Renseignez m365.clientId et m365.clientSecret dans les Settings.",
      );
    }
    return { clientId, clientSecret };
  }

  /**
   * URL d'admin-consent que MDO transmet au client. Le client clique, signe
   * dans son tenant en tant qu'admin et accepte les permissions. Azure redirige
   * ensuite vers notre `redirectUri` avec `tenant=<guid>&admin_consent=True&state=<companyId>`.
   */
  async buildAdminConsentUrl(companyId: string, me: JwtUser): Promise<string> {
    await this.scope.assertCompanyInTenant(companyId, me);
    const { clientId } = await this.getAppCredentials(me.tenantId);
    const baseUrl =
      (await this.settings.get('app.publicUrl', me.tenantId))
      ?? 'https://crm.mdoservices.fr';
    const redirectUri = encodeURIComponent(baseUrl.replace(/\/+$/, '') + '/api/m365/consent/callback');
    // common = endpoint multi-tenant, le tenant_id reel est renvoye au callback.
    return (
      'https://login.microsoftonline.com/common/v2.0/adminconsent' +
      '?client_id=' + encodeURIComponent(clientId) +
      '&scope=' + encodeURIComponent('https://graph.microsoft.com/.default') +
      '&redirect_uri=' + redirectUri +
      '&state=' + encodeURIComponent(companyId)
    );
  }

  /**
   * Callback admin-consent. Azure passe `tenant`, `admin_consent`, `state`
   * (= companyId), eventuellement `error` si refuse. On enregistre le tenant
   * et on lance une premiere sync. PAS de scope tenant ici : c'est un
   * callback OAuth public (Azure -> nous), on lookup le companyId pour
   * resoudre le tenant CRM proprietaire.
   */
  async handleConsentCallback(params: {
    tenant?: string;
    admin_consent?: string;
    state?: string;
    error?: string;
    error_description?: string;
  }) {
    if (params.error) {
      throw new BadRequestException(
        'Consent refuse : ' + (params.error_description ?? params.error),
      );
    }
    if (!params.tenant || !params.state) {
      throw new BadRequestException('Parametres tenant/state manquants.');
    }
    const companyId = params.state;
    const tenantId = params.tenant;

    const existing = await this.prisma.m365Tenant.findUnique({ where: { companyId } });
    const data = {
      tenantId,
      consentedAt: new Date(),
      isActive: true,
      lastSyncError: null,
    };
    const tenant = existing
      ? await this.prisma.m365Tenant.update({ where: { companyId }, data })
      : await this.prisma.m365Tenant.create({ data: { ...data, companyId } });

    // Sync immediate en best-effort (non bloquante pour le redirect).
    this.syncTenantInternal(tenant.id).catch((err) =>
      this.logger.warn('Sync initiale M365 echouee pour ' + companyId + ' : ' + err.message),
    );

    return { companyId, tenantId };
  }

  // ============================================================
  // Sync (entry points)
  // ============================================================
  async syncTenantByCompany(companyId: string, me: JwtUser) {
    await this.scope.assertCompanyInTenant(companyId, me);
    const tenant = await this.prisma.m365Tenant.findUnique({ where: { companyId } });
    if (!tenant) throw new NotFoundException('Aucun tenant M365 connecte pour cette societe.');
    return this.syncTenantInternal(tenant.id);
  }

  // Methode interne : prend l'ID du M365Tenant et resout le tenant CRM via la company.
  // Appelable depuis cron (sans contexte user).
  async syncTenantInternal(m365TenantPk: string) {
    const tenant = await this.prisma.m365Tenant.findUnique({
      where: { id: m365TenantPk },
      include: { company: { select: { tenantId: true } } },
    });
    if (!tenant) throw new NotFoundException();
    if (!tenant.isActive) throw new BadRequestException('Tenant desactive.');

    const crmTenantId = tenant.company.tenantId;
    const { clientId, clientSecret } = await this.getAppCredentials(crmTenantId);
    const errors: string[] = [];

    try {
      const accessToken = await this.graph.getAccessToken(tenant.tenantId, clientId, clientSecret);
      const usersCount = await this.syncUsers(tenant.id, accessToken).catch((e) => { errors.push('users: ' + e.message); return 0; });
      const licCount = await this.syncLicenses(tenant.id, accessToken).catch((e) => { errors.push('licenses: ' + e.message); return 0; });
      const mfaUpdated = await this.syncMfaStatus(tenant.id, accessToken).catch((e) => { errors.push('mfa: ' + e.message); return 0; });
      const alertsCount = await this.syncSecurityAlerts(tenant.id, accessToken).catch((e) => { errors.push('alerts: ' + e.message); return 0; });
      const securePercent = await this.syncSecureScore(tenant.id, accessToken).catch((e) => { errors.push('secureScore: ' + e.message); return null; });

      const status = errors.length === 0 ? 'OK' : 'PARTIAL';
      await this.prisma.m365Tenant.update({
        where: { id: tenant.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: status,
          lastSyncError: errors.length > 0 ? errors.join(' | ').slice(0, 500) : null,
        },
      });
      return { usersCount, licCount, mfaUpdated, alertsCount, securePercent, errors };
    } catch (err: any) {
      await this.prisma.m365Tenant.update({
        where: { id: tenant.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: 'FAILED',
          lastSyncError: err.message?.slice(0, 500),
        },
      });
      throw err;
    }
  }

  private async syncUsers(tenantPk: string, accessToken: string): Promise<number> {
    // On selectionne uniquement les champs utiles pour limiter la taille
    // de reponse Graph (et donc le temps de sync).
    const select =
      'id,userPrincipalName,displayName,jobTitle,department,accountEnabled,signInActivity,assignedLicenses';
    const users = await this.graph.getAll<any>(
      accessToken,
      '/users?$top=999&$select=' + encodeURIComponent(select),
    );

    // Map sku -> partNumber (via /subscribedSkus pour traduire skuId -> skuPartNumber)
    const skus = await this.graph.getAll<any>(accessToken, '/subscribedSkus');
    const skuIdToPartNumber = new Map<string, string>();
    for (const s of skus) skuIdToPartNumber.set(s.skuId, s.skuPartNumber);

    // Upsert chaque user (Prisma createMany ne supporte pas onConflict ici)
    for (const u of users) {
      const licenseSkus = (u.assignedLicenses ?? [])
        .map((l: any) => skuIdToPartNumber.get(l.skuId))
        .filter((x: string | undefined): x is string => Boolean(x));
      const lastSignInAt = u.signInActivity?.lastSignInDateTime
        ? new Date(u.signInActivity.lastSignInDateTime)
        : null;
      await this.prisma.m365User.upsert({
        where: { m365TenantId_graphId: { m365TenantId: tenantPk, graphId: u.id } },
        update: {
          upn: u.userPrincipalName,
          displayName: u.displayName,
          jobTitle: u.jobTitle,
          department: u.department,
          accountEnabled: !!u.accountEnabled,
          lastSignInAt,
          licenseSkus: licenseSkus as unknown as Prisma.InputJsonValue,
          syncedAt: new Date(),
        },
        create: {
          m365TenantId: tenantPk,
          graphId: u.id,
          upn: u.userPrincipalName,
          displayName: u.displayName,
          jobTitle: u.jobTitle,
          department: u.department,
          accountEnabled: !!u.accountEnabled,
          lastSignInAt,
          licenseSkus: licenseSkus as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // Supprime les users disparus (ex. utilisateur efface dans Entra ID)
    const graphIds = users.map((u) => u.id);
    if (graphIds.length > 0) {
      await this.prisma.m365User.deleteMany({
        where: { m365TenantId: tenantPk, graphId: { notIn: graphIds } },
      });
    }
    return users.length;
  }

  private async syncLicenses(tenantPk: string, accessToken: string): Promise<number> {
    const skus = await this.graph.getAll<any>(accessToken, '/subscribedSkus');
    for (const s of skus) {
      await this.prisma.m365License.upsert({
        where: { m365TenantId_skuId: { m365TenantId: tenantPk, skuId: s.skuId } },
        update: {
          skuPartNumber: s.skuPartNumber,
          name: SKU_LABELS[s.skuPartNumber] ?? s.skuPartNumber,
          totalUnits: s.prepaidUnits?.enabled ?? 0,
          consumedUnits: s.consumedUnits ?? 0,
          syncedAt: new Date(),
        },
        create: {
          m365TenantId: tenantPk,
          skuId: s.skuId,
          skuPartNumber: s.skuPartNumber,
          name: SKU_LABELS[s.skuPartNumber] ?? s.skuPartNumber,
          totalUnits: s.prepaidUnits?.enabled ?? 0,
          consumedUnits: s.consumedUnits ?? 0,
        },
      });
    }
    return skus.length;
  }

  /**
   * Statut MFA via l'API Reports d'identite. Necessite la permission
   * `AuditLog.Read.All` (ou `Reports.Read.All`) ET un tenant avec Entra ID
   * (anciennement Azure AD) Premium pour avoir le rapport detaille.
   * Si l'API n'est pas accessible (non-premium ou permission manquante),
   * on capture l'erreur et on laisse `mfaEnabled = null` sur les users.
   */
  private async syncMfaStatus(tenantPk: string, accessToken: string): Promise<number> {
    const details = await this.graph.getAll<any>(
      accessToken,
      '/reports/authenticationMethods/userRegistrationDetails?$top=999',
    );
    let updated = 0;
    for (const d of details) {
      // d.id = userPrincipalName ; on cible donc par UPN.
      const r = await this.prisma.m365User.updateMany({
        where: { m365TenantId: tenantPk, upn: d.userPrincipalName },
        data: { mfaEnabled: !!d.isMfaRegistered },
      });
      updated += r.count;
    }
    return updated;
  }

  /**
   * Alertes de securite (Microsoft Defender / Identity Protection unifie
   * via Graph Security API v2). Necessite `SecurityAlert.Read.All`.
   */
  private async syncSecurityAlerts(tenantPk: string, accessToken: string): Promise<number> {
    // Filtrage : on garde les alertes des 30 derniers jours pour ne pas
    // exploser la BDD. Les alertes plus anciennes sont conservees une fois
    // synchronisees (jamais re-supprimees).
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const alerts = await this.graph.getAll<any>(
      accessToken,
      `/security/alerts_v2?$filter=createdDateTime ge ${since}&$top=200`,
    );
    for (const a of alerts) {
      await this.prisma.m365SecurityAlert.upsert({
        where: { m365TenantId_alertId: { m365TenantId: tenantPk, alertId: a.id } },
        update: {
          severity: a.severity ?? 'informational',
          status: a.status ?? 'newAlert',
          title: a.title?.slice(0, 500) ?? '(sans titre)',
          description: a.description?.slice(0, 2000) ?? null,
          category: a.category ?? null,
          syncedAt: new Date(),
        },
        create: {
          m365TenantId: tenantPk,
          alertId: a.id,
          severity: a.severity ?? 'informational',
          status: a.status ?? 'newAlert',
          title: a.title?.slice(0, 500) ?? '(sans titre)',
          description: a.description?.slice(0, 2000) ?? null,
          category: a.category ?? null,
          createdDateTime: new Date(a.createdDateTime),
        },
      });
    }
    return alerts.length;
  }

  /**
   * Microsoft Secure Score
   */
  private async syncSecureScore(tenantPk: string, accessToken: string): Promise<number | null> {
    const items = await this.graph.getAll<any>(accessToken, '/security/secureScores?$top=1');
    if (items.length === 0) {
      await this.prisma.m365Tenant.update({
        where: { id: tenantPk },
        data: {
          secureScore: null,
          secureScoreMax: null,
          secureScorePercent: null,
          secureScoreSyncedAt: new Date(),
        },
      });
      return null;
    }
    const s = items[0];
    const current = typeof s.currentScore === 'number' ? s.currentScore : Number(s.currentScore);
    const max = typeof s.maxScore === 'number' ? s.maxScore : Number(s.maxScore);
    if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return null;
    const percent = (current / max) * 100;
    await this.prisma.m365Tenant.update({
      where: { id: tenantPk },
      data: {
        secureScore: current,
        secureScoreMax: max,
        secureScorePercent: percent,
        secureScoreSyncedAt: new Date(),
      },
    });
    return percent;
  }

  // ============================================================
  // Lecture (pour l'UI) - scope tenant via la company
  // ============================================================
  async getForCompany(companyId: string, me: JwtUser) {
    await this.scope.assertCompanyInTenant(companyId, me);
    const tenant = await this.prisma.m365Tenant.findUnique({
      where: { companyId },
      include: {
        _count: { select: { users: true, licenses: true, alerts: true } },
      },
    });
    return tenant; // peut etre null = pas encore connecte
  }

  async listUsers(companyId: string, me: JwtUser) {
    await this.scope.assertCompanyInTenant(companyId, me);
    const tenant = await this.prisma.m365Tenant.findUnique({ where: { companyId } });
    if (!tenant) return [];
    return this.prisma.m365User.findMany({
      where: { m365TenantId: tenant.id },
      orderBy: [{ accountEnabled: 'desc' }, { displayName: 'asc' }],
    });
  }

  async listLicenses(companyId: string, me: JwtUser) {
    await this.scope.assertCompanyInTenant(companyId, me);
    const tenant = await this.prisma.m365Tenant.findUnique({ where: { companyId } });
    if (!tenant) return [];
    return this.prisma.m365License.findMany({
      where: { m365TenantId: tenant.id },
      orderBy: { name: 'asc' },
    });
  }

  async listAlerts(companyId: string, me: JwtUser) {
    await this.scope.assertCompanyInTenant(companyId, me);
    const tenant = await this.prisma.m365Tenant.findUnique({ where: { companyId } });
    if (!tenant) return [];
    return this.prisma.m365SecurityAlert.findMany({
      where: { m365TenantId: tenant.id, status: { not: 'resolved' } },
      orderBy: [{ severity: 'asc' }, { createdDateTime: 'desc' }],
      take: 50,
    });
  }

  // Liste tous les M365Tenants du tenant CRM courant (super-admin voit tout).
  async listAllTenants(me: JwtUser) {
    return this.prisma.m365Tenant.findMany({
      where: me.isSuperAdmin ? {} : { company: { tenantId: me.tenantId } },
      orderBy: { createdAt: 'desc' },
      include: {
        company: { select: { id: true, name: true } },
        _count: { select: { users: true, licenses: true, alerts: true } },
      },
    });
  }

  async disconnect(companyId: string, me: JwtUser) {
    await this.scope.assertCompanyInTenant(companyId, me);
    const tenant = await this.prisma.m365Tenant.findUnique({ where: { companyId } });
    if (!tenant) throw new NotFoundException();
    // On supprime tout (users/licenses/alerts) via cascade.
    await this.prisma.m365Tenant.delete({ where: { id: tenant.id } });
    this.graph.invalidateCache(tenant.tenantId);
    return { ok: true };
  }

  // ============================================================
  // Cron quotidien : sync tous les M365Tenants actifs (cross-tenant CRM)
  // 06:00 Europe/Paris. Chaque sync resout les credentials selon le
  // tenant CRM proprietaire (via company.tenantId).
  // ============================================================
  @Cron('0 6 * * *', { name: 'm365-daily-sync', timeZone: 'Europe/Paris' })
  async runDailySync() {
    const tenants = await this.prisma.m365Tenant.findMany({
      where: { isActive: true },
      select: { id: true, companyId: true },
    });
    this.logger.log('M365 cron : ' + tenants.length + ' tenant(s) a synchroniser');
    let ok = 0;
    let failed = 0;
    for (const t of tenants) {
      try {
        await this.syncTenantInternal(t.id);
        ok++;
      } catch (err: any) {
        failed++;
        this.logger.warn('M365 sync echec ' + t.companyId + ' : ' + err.message);
      }
    }
    this.logger.log('M365 cron termine : ' + ok + ' OK, ' + failed + ' echec(s)');
  }
}
