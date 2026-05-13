import {
  BadRequestException,
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
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { ClientReportStatus, Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { ClientReportsService } from './client-reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Reports')
@Controller()
export class ClientReportsController {
  constructor(private readonly service: ClientReportsService) {}

  // ============================================================
  // Endpoints ADMIN/MANAGER : generation, envoi, liste
  // ============================================================

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('client-reports')
  listAll(@Query('status') status?: ClientReportStatus, @Query('limit') limit?: string) {
    return this.service.listAll({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('companies/:companyId/reports')
  listForCompany(@Param('companyId') companyId: string) {
    return this.service.listForCompany(companyId);
  }

  /**
   * Genere un rapport pour un mois donne (defaut = mois precedent).
   * Body : { month?: 'YYYY-MM', force?: boolean }
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('companies/:companyId/reports/generate')
  async generate(
    @Param('companyId') companyId: string,
    @CurrentUser() user: JwtUser,
    @Body() body: { month?: string; force?: boolean } = {},
  ) {
    const period = this.parseMonth(body.month);
    return this.service.generateForCompany(companyId, period, {
      force: body.force === true,
      generatedById: user.id,
    });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('client-reports/:id/send')
  send(@Param('id') id: string, @Body() body: { to?: string } = {}) {
    return this.service.sendByEmail(id, body.to);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.MANAGER)
  @Delete('client-reports/:id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  /**
   * Telechargement direct (admin) d'un rapport, sans passer par le token public.
   * Utile depuis la fiche societe ou la page admin "Historique des rapports".
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('client-reports/:id/pdf')
  async downloadAdmin(@Param('id') id: string, @Res() res: Response) {
    const report = await this.service.findById(id);
    const fullPath = this.service.getFullPath(report.pdfPath);
    return this.streamPdf(res, fullPath, this.filenameFor(report.periodStart));
  }

  // ============================================================
  // Endpoint PUBLIC : telechargement par token cryptosecure
  // ============================================================
  // Rate-limit serre : 10 req/min/IP pour eviter le brute force du token.
  // Le token est 32 bytes hex (256 bits), donc le brute force est de toute facon
  // irrealiste, mais on protege contre le scan automatique.
  @Public()
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @Get('reports/download/:token')
  async downloadByToken(@Param('token') token: string, @Res() res: Response) {
    const { fullPath, filename } = await this.service.resolveDownloadToken(token);
    return this.streamPdf(res, fullPath, filename);
  }

  // ============================================================
  // Helpers
  // ============================================================
  private parseMonth(month?: string): Date {
    if (!month) {
      // Defaut : mois precedent (utile pour "generer le rapport du mois passe")
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - 1);
      return d;
    }
    const m = month.match(/^(\d{4})-(\d{2})$/);
    if (!m) throw new BadRequestException('Format mois invalide (attendu YYYY-MM)');
    const year = parseInt(m[1], 10);
    const monthIdx = parseInt(m[2], 10) - 1;
    if (monthIdx < 0 || monthIdx > 11) throw new BadRequestException('Mois hors plage');
    return new Date(year, monthIdx, 1);
  }

  private filenameFor(periodStart: Date): string {
    const y = periodStart.getFullYear();
    const m = String(periodStart.getMonth() + 1).padStart(2, '0');
    return `rapport-mdo-${y}-${m}.pdf`;
  }

  private async streamPdf(res: Response, fullPath: string, filename: string) {
    try {
      const s = await stat(fullPath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', s.size);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      // Pas de cache : le PDF est sensible (donnees client).
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      createReadStream(fullPath).pipe(res);
    } catch (err: any) {
      throw new BadRequestException('Fichier introuvable sur disque : ' + err.message);
    }
  }
}
