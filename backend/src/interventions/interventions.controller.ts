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
import { InterventionStatus } from '@prisma/client';
import { InterventionsService } from './interventions.service';
import { PdfService } from '../pdf/pdf.service';
import { CreateInterventionDto } from './dto/create-intervention.dto';
import { UpdateInterventionDto } from './dto/update-intervention.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Interventions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('interventions')
export class InterventionsController {
  constructor(
    private readonly service: InterventionsService,
    private readonly pdf: PdfService,
  ) {}

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

  @Post()
  create(@Body() dto: CreateInterventionDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInterventionDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
