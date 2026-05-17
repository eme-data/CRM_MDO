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
import { SuperAdminGuard } from '../tenants/guards/super-admin.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

// SYSTEM BACKUP : sauvegarde de la BDD ENTIERE (tous tenants confondus) +
// uploads. Strictement reserve au super-admin (proprietaire de l'instance).
// Un ADMIN d'un tenant client ne doit JAMAIS pouvoir telecharger un dump
// qui contiendrait les donnees des autres tenants — sinon exfiltration
// totale du SaaS via un compte client compromis.
//
// Avant : @Roles('ADMIN') => leak critique. Tout ADMIN tenant pouvait
// list/download/restore. Maintenant : SuperAdminGuard exige
// req.user.isSuperAdmin === true.

@ApiTags('System backup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('system-backup')
export class SystemBackupController {
  constructor(private readonly service: SystemBackupService) {}

  @Get()
  list(
    @Query('kind') kind?: SystemBackupKind,
    @Query('status') status?: SystemBackupStatus,
  ) {
    return this.service.list({ kind, status });
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Post()
  create(@Body() body: { includeUploads?: boolean }, @CurrentUser() user: JwtUser) {
    return this.service.createBackup({ kind: 'MANUAL', userId: user.id, includeUploads: body.includeUploads });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const r = await this.service.stream(id);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', 'attachment; filename="' + r.filename + '"');
    if (r.sizeBytes) res.setHeader('Content-Length', String(r.sizeBytes));
    // Cleanup explicite : si le client se deconnecte ou si le stream
    // throw, on libere le file descriptor au lieu de fuir. Sans ces
    // listeners, un download interrompu (ferme l'onglet en plein telechargement
    // d'un dump 5GB) garde le FD ouvert jusqu'au GC — saturation possible.
    r.stream.on('error', () => res.destroy());
    res.on('close', () => r.stream.destroy());
    r.stream.pipe(res);
  }

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

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
