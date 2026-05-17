import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Tenant } from '@prisma/client';

// Service de branding : expose au frontend les variables de personnalisation.
//
// Strategie multi-tenant : lecture en cascade
//   1. BDD (Tenant.brand* du tenant resolu pour le domaine) — source primaire
//   2. Env vars BRAND_* (defaults globaux) — fallback
//   3. Defauts MDO hardcodes — ultime fallback
//
// La couche env reste utile pour le boot tout premier (avant que les tenants
// existent en BDD) et pour l'overide global de defauts.

export interface BrandingConfig {
  name: string;
  shortName: string;
  tagline: string;
  supportEmail: string;
  dpoEmail: string;
  websiteUrl: string;
  logoUrl: string;
  primaryColor: string;
  footerText: string;
  instanceType: 'MDO' | 'CLIENT';
}

@Injectable()
export class BrandingService {
  // Defauts ENV : caches une seule fois (les env vars ne changent pas a
  // runtime). Le tenant lui n'est PAS cache ici : il vient de req.tenant
  // qui est resolu/cache par TenantsService.
  private envDefaults: BrandingConfig | null = null;

  constructor(private readonly config: ConfigService) {}

  // Helper : pick la 1ere valeur non-vide entre tenant, env, default
  private pick(tenantValue: string | null | undefined, envKey: string, fallback: string): string {
    if (tenantValue && tenantValue.trim()) return tenantValue;
    const fromEnv = this.config.get<string>(envKey);
    if (fromEnv && fromEnv.trim()) return fromEnv;
    return fallback;
  }

  get(tenant?: Tenant | null): BrandingConfig {
    return {
      name: this.pick(tenant?.brandName, 'BRAND_NAME', 'MDO Services'),
      shortName: this.pick(tenant?.brandShortName, 'BRAND_SHORT_NAME', 'MDO'),
      tagline: this.pick(tenant?.brandTagline, 'BRAND_TAGLINE',
        'Prestataire IT et Cybersecurite - Occitanie'),
      supportEmail: this.pick(tenant?.brandSupportEmail, 'BRAND_SUPPORT_EMAIL', 'support@mdoservices.fr'),
      dpoEmail: this.pick(tenant?.brandDpoEmail, 'BRAND_DPO_EMAIL', 'dpo@mdoservices.fr'),
      websiteUrl: this.pick(tenant?.brandWebsiteUrl, 'BRAND_WEBSITE_URL', 'https://www.mdoservices.fr'),
      logoUrl: this.pick(tenant?.brandLogoUrl, 'BRAND_LOGO_URL', '/logo.svg'),
      primaryColor: this.pick(tenant?.brandPrimaryColor, 'BRAND_PRIMARY_COLOR', '#1d4ed8'),
      footerText: this.pick(tenant?.brandFooterText, 'BRAND_FOOTER_TEXT',
        'MDO Services - Prestataire IT et Cybersecurite - Occitanie'),
      // Type d'instance : si on a un tenant qui n'est pas le tenant principal
      // 'mdo', c'est forcement une instance CLIENT. Sinon on respecte l'env.
      instanceType: tenant && tenant.slug !== 'mdo'
        ? 'CLIENT'
        : (this.config.get<string>('BRAND_INSTANCE_TYPE') === 'CLIENT' ? 'CLIENT' : 'MDO'),
    };
  }
}
