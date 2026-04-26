import { Controller, Get, Logger, Param, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { EmergencyPdfService } from './emergency-pdf.service';
import { PrismaService } from '../database/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('EmergencyPdf')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class EmergencyPdfController {
  private readonly logger = new Logger(EmergencyPdfController.name);

  constructor(
    private readonly service: EmergencyPdfService,
    private readonly prisma: PrismaService,
  ) {}

  // Reserve aux roles ADMIN/MANAGER (donnees sensibles aggregees)
  @Roles('ADMIN', 'MANAGER')
  @Get(':id/emergency-pdf')
  async download(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser() user: JwtUser,
  ) {
    const { buffer, filename } = await this.service.generateForCompany(id);
    // Audit : qui a sorti le dossier d'urgence
    await this.prisma.activity.create({
      data: { userId: user.id, action: 'EXPORT_EMERGENCY_PDF', entity: 'Company', entityId: id },
    });
    this.logger.log('Emergency PDF genere par user ' + user.id + ' pour company ' + id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.send(buffer);
  }
}
