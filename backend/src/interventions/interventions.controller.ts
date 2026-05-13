import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { InterventionStatus, Role } from '@prisma/client';
import { InterventionsService } from './interventions.service';
import { IcalService } from './ical.service';
import { PdfService } from '../pdf/pdf.service';
import { CreateInterventionDto } from './dto/create-intervention.dto';
import { UpdateInterventionDto } from './dto/update-intervention.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Interventions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('interventions')
export class InterventionsController {
  constructor(
    private readonly service: InterventionsService,
    private readonly pdf: PdfService,
    private readonly ical: IcalService,
  ) {}

  // --- iCal export pour l'utilisateur connecte ---
  // GET /interventions/me/ical/url renvoie l'URL signee a coller dans
  // Outlook/Google Calendar. Le token est genere si absent.
  @Get('me/ical/url')
  async myIcalUrl(@CurrentUser() user: JwtUser) {
    const token = await this.ical.getOrCreateToken(user.id);
    return { token, hint: '/api/calendar/' + token + '/interventions.ics' };
  }

  @Post('me/ical/regenerate')
  async regenerateIcal(@CurrentUser() user: JwtUser) {
    const token = await this.ical.regenerateToken(user.id);
    return { token, hint: '/api/calendar/' + token + '/interventions.ics' };
  }

  @Delete('me/ical')
  async revokeIcal(@CurrentUser() user: JwtUser) {
    await this.ical.revokeToken(user.id);
    return { revoked: true };
  }

  @Get()
  findAll(
    @Query('status') status?: InterventionStatus,
    @Query('companyId') companyId?: string,
    @Query('contractId') contractId?: string,
    @Query('technicianId') technicianId?: string,
  ) {
    return this.service.findAll({ status, companyId, contractId, technicianId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const i = await this.service.findOne(id);
    const buf = await this.pdf.interventionReport({
      intervention: {
        title: i.title,
        type: i.type,
        scheduledAt: i.scheduledAt,
        startedAt: i.startedAt,
        endedAt: i.endedAt,
        durationMin: i.durationMin,
        description: i.description,
        report: i.report,
      },
      client: {
        name: i.company.name,
        address: i.company.address ?? undefined,
        postalCode: i.company.postalCode ?? undefined,
        city: i.company.city ?? undefined,
      },
      technician: i.technician ?? undefined,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="intervention_' + id + '.pdf"');
    res.send(buf);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post()
  create(@Body() dto: CreateInterventionDto) {
    return this.service.create(dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInterventionDto) {
    return this.service.update(id, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
