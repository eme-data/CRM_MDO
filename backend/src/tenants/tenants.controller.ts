import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { SuperAdminGuard } from './guards/super-admin.guard';

// Endpoints reserves au super-admin (Mathieu). Permettent de creer/lister/
// editer/desactiver les tenants depuis l'UI super-admin.

@ApiTags('Tenants (super-admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly service: TenantsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() body: {
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
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // ============================================================
  // RGPD : export (article 20) + purge (article 17)
  // ============================================================

  // Export complet des donnees du tenant en JSON. A appeler AVANT la purge
  // pour offrir au client son dump de portabilite. Stream en attachment.
  @Get(':id/export')
  async export(@Param('id') id: string, @Res() res: Response) {
    const data = await this.service.export(id);
    const filename = `tenant-${data.tenant.slug}-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(data, null, 2));
  }

  // Purge IRREVERSIBLE. Requiert le slug du tenant en confirmation (anti
  // suppression accidentelle). Recommandation : appeler /export avant.
  // Body : { confirmSlug: "<slug-exact-du-tenant>" }
  @Post(':id/purge')
  async purge(
    @Param('id') id: string,
    @Body() body: { confirmSlug: string },
    @CurrentUser() user: JwtUser,
  ) {
    if (!body?.confirmSlug) {
      throw new BadRequestException('Champ confirmSlug requis dans le body');
    }
    return this.service.purge(id, body.confirmSlug, user.id);
  }

  // Regenere la config Caddy a partir de la liste actuelle des tenants
  // actifs et la pousse via l'admin API Caddy. Trigge automatiquement a
  // chaque create/update/remove de tenant ; cet endpoint sert pour reset
  // manuel apres modif d'env ou debug.
  @Post('regenerate-caddy')
  async regenerateCaddy() {
    return this.service.regenerateCaddy();
  }
}
