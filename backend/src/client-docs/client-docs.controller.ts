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
  list(@Query('companyId') companyId: string, @CurrentUser() user: JwtUser) {
    return this.docs.listForCompany(companyId, user);
  }

  @Get('doc-pages/:id')
  one(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.docs.findOne(id, user);
  }

  @Post('doc-pages')
  create(@Body() dto: CreateDocPageDto, @CurrentUser() user: JwtUser) {
    return this.docs.create(dto, user);
  }

  @Patch('doc-pages/:id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateDocPageDto> & { reason?: string },
    @CurrentUser() user: JwtUser,
  ) {
    const { reason, ...rest } = dto as any;
    return this.docs.update(id, rest, user, reason);
  }

  @Delete('doc-pages/:id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.docs.remove(id, user);
  }

  // ----- Versioning -----
  @Get('doc-pages/:id/versions')
  versions(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.docs.listVersions(id, user);
  }

  @Get('doc-pages/versions/:versionId')
  version(@Param('versionId') versionId: string, @CurrentUser() user: JwtUser) {
    return this.docs.getVersion(versionId, user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('doc-pages/versions/:versionId/restore')
  restore(@Param('versionId') versionId: string, @CurrentUser() user: JwtUser) {
    return this.docs.restoreVersion(versionId, user);
  }

  // ----- Secrets -----
  @Get('secrets')
  listSecrets(@Query('companyId') companyId: string, @CurrentUser() user: JwtUser) {
    return this.secrets.listForCompany(companyId, user);
  }

  @Get('secrets/:id/reveal')
  reveal(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.secrets.reveal(id, user);
  }

  // Genere uniquement le code TOTP courant (sans reveler le mot de passe)
  @Get('secrets/:id/totp')
  totp(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.secrets.getTotp(id, user);
  }

  // Historique d'acces a ce secret (qui a vu / quand) - audit NIS2/RGPD
  @Roles('ADMIN', 'MANAGER')
  @Get('secrets/:id/access-log')
  accessLog(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.secrets.accessLog(id, user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('secrets')
  createSecret(@Body() dto: CreateSecretDto, @CurrentUser() user: JwtUser) {
    return this.secrets.create(dto, user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Patch('secrets/:id')
  updateSecret(
    @Param('id') id: string,
    @Body() dto: Partial<CreateSecretDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.secrets.update(id, dto, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete('secrets/:id')
  removeSecret(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.secrets.remove(id, user);
  }
}
