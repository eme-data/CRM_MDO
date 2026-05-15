import {
  Body,
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
import { SystemBackupKind, SystemBackupStatus } from '@prisma/client';
import { SystemBackupService } from './system-backup.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('System backup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('system-backup')
export class SystemBackupController {
  constructor(private readonly service: SystemBackupService) {}

  @Roles('ADMIN')
  @Get()
  list(
    @Query('kind') kind?: SystemBackupKind,
    @Query('status') status?: SystemBackupStatus,
  ) {
    return this.service.list({ kind, status });
  }

  @Roles('ADMIN')
  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() body: { includeUploads?: boolean }, @CurrentUser() user: JwtUser) {
    return this.service.createBackup({ kind: 'MANUAL', userId: user.id, includeUploads: body.includeUploads });
  }

  @Roles('ADMIN')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const r = await this.service.stream(id);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', 'attachment; filename="' + r.filename + '"');
    if (r.sizeBytes) res.setHeader('Content-Length', String(r.sizeBytes));
    r.stream.pipe(res);
  }

  @Roles('ADMIN')
  @Post(':id/restore')
  restore(
    @Param('id') id: string,
    @Body() body: { currentPassword: string; confirmPhrase: string },
    @CurrentUser() user: JwtUser,
  ) {
    if (body.confirmPhrase !== 'JE CONFIRME LA RESTAURATION') {
      return { ok: false, error: 'Confirmation invalide. Tapez exactement : JE CONFIRME LA RESTAURATION' };
    }
    return this.service.restore(id, user.id, body.currentPassword);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
