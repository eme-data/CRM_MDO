import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ClientDocsService } from './client-docs.service';
import { SecretsService } from './secrets.service';
import { CreateDocPageDto } from './dto/create-doc-page.dto';
import { CreateSecretDto } from './dto/create-secret.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('ClientDocs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ClientDocsController {
  constructor(
    private readonly docs: ClientDocsService,
    private readonly secrets: SecretsService,
  ) {}

  // ----- Doc pages -----
  @Get('doc-pages')
  list(@Query('companyId') companyId: string) {
    return this.docs.listForCompany(companyId);
  }

  @Get('doc-pages/:id')
  one(@Param('id') id: string) { return this.docs.findOne(id); }

  @Post('doc-pages')
  create(@Body() dto: CreateDocPageDto, @CurrentUser() user: JwtUser) {
    return this.docs.create(dto, user.id);
  }

  @Patch('doc-pages/:id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateDocPageDto> & { reason?: string },
    @CurrentUser() user: JwtUser,
  ) {
    const { reason, ...rest } = dto as any;
    return this.docs.update(id, rest, user.id, reason);
  }

  @Delete('doc-pages/:id')
  remove(@Param('id') id: string) { return this.docs.remove(id); }

  // ----- Versioning -----
  @Get('doc-pages/:id/versions')
  versions(@Param('id') id: string) { return this.docs.listVersions(id); }

  @Get('doc-pages/versions/:versionId')
  version(@Param('versionId') versionId: string) { return this.docs.getVersion(versionId); }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('doc-pages/versions/:versionId/restore')
  restore(@Param('versionId') versionId: string, @CurrentUser() user: JwtUser) {
    return this.docs.restoreVersion(versionId, user.id);
  }

  // ----- Secrets -----
  @Get('secrets')
  listSecrets(@Query('companyId') companyId: string) {
    return this.secrets.listForCompany(companyId);
  }

  @Get('secrets/:id/reveal')
  reveal(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.secrets.reveal(id, user.id);
  }

  // Genere uniquement le code TOTP courant (sans reveler le mot de passe)
  @Get('secrets/:id/totp')
  totp(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.secrets.getTotp(id, user.id);
  }

  // Historique d'acces a ce secret (qui a vu / quand) - audit NIS2/RGPD
  @Roles('ADMIN', 'MANAGER')
  @Get('secrets/:id/access-log')
  accessLog(@Param('id') id: string) {
    return this.secrets.accessLog(id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('secrets')
  createSecret(@Body() dto: CreateSecretDto, @CurrentUser() user: JwtUser) {
    return this.secrets.create(dto, user.id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Patch('secrets/:id')
  updateSecret(
    @Param('id') id: string,
    @Body() dto: Partial<CreateSecretDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.secrets.update(id, dto, user.id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete('secrets/:id')
  removeSecret(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.secrets.remove(id, user.id);
  }
}
