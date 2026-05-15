import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Service de branding : expose au frontend les variables de personnalisation
// configurees au deploiement (BRAND_*). Permet d'avoir N instances du CRM
// brandees differemment sans rebuilder l'image Docker.
//
// Lecture depuis ConfigService (env vars), avec defaut MDO Services partout
// pour preserver l'instance actuelle quand on push cette feature.

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
  private cache: BrandingConfig | null = null;

  constructor(private readonly config: ConfigService) {}

  // Lit une seule fois au boot (les env vars ne changent pas a runtime).
  // Pas de TTL : si Mathieu modifie le .env, il restart le conteneur de toute facon.
  get(): BrandingConfig {
    if (this.cache) return this.cache;
    this.cache = {
      name: this.config.get<string>('BRAND_NAME') ?? 'MDO Services',
      shortName: this.config.get<string>('BRAND_SHORT_NAME') ?? 'MDO',
      tagline: this.config.get<string>('BRAND_TAGLINE')
        ?? 'Prestataire IT et Cybersecurite - Occitanie',
      supportEmail: this.config.get<string>('BRAND_SUPPORT_EMAIL') ?? 'support@mdoservices.fr',
      dpoEmail: this.config.get<string>('BRAND_DPO_EMAIL') ?? 'dpo@mdoservices.fr',
      websiteUrl: this.config.get<string>('BRAND_WEBSITE_URL') ?? 'https://www.mdoservices.fr',
      logoUrl: this.config.get<string>('BRAND_LOGO_URL') ?? '/logo.png',
      primaryColor: this.config.get<string>('BRAND_PRIMARY_COLOR') ?? '#1d4ed8',
      footerText: this.config.get<string>('BRAND_FOOTER_TEXT')
        ?? 'MDO Services - Prestataire IT et Cybersecurite - Occitanie',
      instanceType: (this.config.get<string>('BRAND_INSTANCE_TYPE') === 'CLIENT' ? 'CLIENT' : 'MDO'),
    };
    return this.cache;
  }
}
