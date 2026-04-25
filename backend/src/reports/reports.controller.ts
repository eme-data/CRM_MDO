import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('mrr-trend')
  mrrTrend() { return this.service.mrrTrend(); }

  @Get('top-clients')
  topClients() { return this.service.topClients(); }

  @Get('sla-respect')
  slaRespect() { return this.service.slaRespect(); }

  @Get('pipeline')
  pipeline() { return this.service.pipeline(); }

  @Get('time-by-tech')
  timeByTech() { return this.service.timeByTech(); }

  @Get('revenue-trend')
  revenueTrend() { return this.service.revenueTrend(); }
}
