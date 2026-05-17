import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BackupService } from './backup.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Backup verification')
@Controller('backup-jobs')
export class BackupController {
  constructor(private readonly service: BackupService) {}

  // ---------- Webhook public (auth via secret) ----------
  // POST /backup-jobs/:id/runs avec header X-Backup-Secret
  @Public()
  @Post(':id/runs')
  ingest(
    @Param('id') id: string,
    @Headers('x-backup-secret') secret: string | undefined,
    @Body() body: any,
  ) {
    if (!secret) return { ok: false, reason: 'X-Backup-Secret header missing' };
    return this.service.ingestViaSecret(id, secret, body);
  }

  // ---------- CRUD ----------
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  list(@CurrentUser() user: JwtUser, @Query('companyId') companyId?: string) {
    return this.service.list(user, { companyId });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('stats')
  stats(@CurrentUser() user: JwtUser) {
    return this.service.stats(user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() body: any, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }

  // Saisie manuelle (UI) — meme endpoint que webhook mais avec JWT.
  // On verifie le tenant ownership avant d'appeler recordRun (qui est aussi
  // utilise par le webhook public auth via secret, donc sans scope tenant).
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post(':id/runs/manual')
  async recordManual(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: JwtUser,
  ) {
    await this.service.findOne(id, user); // assert tenant ownership
    return this.service.recordRun(id, body);
  }
}
