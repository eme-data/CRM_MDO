import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { BrandingService } from './branding.service';
import { OptionalTenant } from '../tenants/decorators/current-tenant.decorator';
import { Tenant } from '@prisma/client';

// Endpoint public : pas d'auth requise. Le frontend l'appelle au boot
// (avant le login) pour afficher le bon nom/logo sur la page de connexion
// et le portail client.

@ApiTags('Branding')
@Controller('branding')
export class BrandingController {
  constructor(private readonly service: BrandingService) {}

  @Public()
  @Get()
  get(@OptionalTenant() tenant?: Tenant) {
    // Multi-tenant : si on a un tenant resolu pour le domaine, on prend ses
    // BRAND_* en prio. Sinon fallback sur les variables d'env (cas du tout
    // premier boot avant qu'aucun tenant n'existe en BDD).
    return this.service.get(tenant);
  }
}
