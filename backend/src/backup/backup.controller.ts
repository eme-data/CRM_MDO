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
  list(@Query('companyId') companyId?: string) {
    return this.service.list({ companyId });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // Saisie manuelle (UI) — meme endpoint que webhook mais avec JWT
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post(':id/runs/manual')
  recordManual(@Param('id') id: string, @Body() body: any) {
    return this.service.recordRun(id, body);
  }
}
