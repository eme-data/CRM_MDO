import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { M365Service } from './m365.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('M365')
@Controller('m365')
export class M365Controller {
  constructor(private readonly service: M365Service) {}

  // ============================================================
  // Admin : configuration & sync
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('companies/:companyId/consent-url')
  async getConsentUrl(@Param('companyId') companyId: string) {
    const url = await this.service.buildAdminConsentUrl(companyId);
    return { url };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('companies/:companyId')
  getForCompany(@Param('companyId') companyId: string) {
    return this.service.getForCompany(companyId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('companies/:companyId/users')
  listUsers(@Param('companyId') companyId: string) {
    return this.service.listUsers(companyId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('companies/:companyId/licenses')
  listLicenses(@Param('companyId') companyId: string) {
    return this.service.listLicenses(companyId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('companies/:companyId/alerts')
  listAlerts(@Param('companyId') companyId: string) {
    return this.service.listAlerts(companyId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('companies/:companyId/sync')
  syncCompany(@Param('companyId') companyId: string) {
    return this.service.syncTenantByCompany(companyId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @Delete('companies/:companyId')
  disconnect(@Param('companyId') companyId: string) {
    return this.service.disconnect(companyId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('tenants')
  listTenants() {
    return this.service.listAllTenants();
  }

  // ============================================================
  // Callback Azure (public, valide via state + tenant + admin_consent)
  // ============================================================
  @Public()
  @Get('consent/callback')
  async consentCallback(
    @Query('tenant') tenant: string,
    @Query('admin_consent') adminConsent: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.service.handleConsentCallback({
        tenant, admin_consent: adminConsent, state, error, error_description: errorDescription,
      });
      // Redirige vers la fiche societe avec un parametre de succes
      res.redirect(302, `/companies/${result.companyId}?m365=connected`);
    } catch (err: any) {
      res.redirect(302, `/companies/${state ?? ''}?m365_error=${encodeURIComponent(err.message)}`);
    }
  }
}
