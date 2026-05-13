import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';

// Donnees business agregees (MRR, pipeline, SLA, revenu). Reservees aux roles
// de pilotage : ADMIN et MANAGER. Les SALES voient le pipeline via /opportunities,
// pas via /reports/pipeline (chiffre consolide).
@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN, Role.MANAGER)
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
