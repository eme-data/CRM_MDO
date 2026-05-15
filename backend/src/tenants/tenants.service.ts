import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Tenant } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

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
    return this.prisma.tenant.create({ data: input });
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
        `Impossible de supprimer : ${userCount} user(s) dans ce tenant. Desactivez plutot via isActive=false.`,
      );
    }
    await this.prisma.tenant.delete({ where: { id } });
    this.invalidateCache(before.customDomain);
    return { ok: true };
  }
}
