import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

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
  mrrTrend(@CurrentUser() u: JwtUser) { return this.service.mrrTrend(u.tenantId); }

  @Get('top-clients')
  topClients(@CurrentUser() u: JwtUser) { return this.service.topClients(u.tenantId); }

  @Get('sla-respect')
  slaRespect(@CurrentUser() u: JwtUser) { return this.service.slaRespect(u.tenantId); }

  @Get('pipeline')
  pipeline(@CurrentUser() u: JwtUser) { return this.service.pipeline(u.tenantId); }

  @Get('time-by-tech')
  timeByTech(@CurrentUser() u: JwtUser) { return this.service.timeByTech(u.tenantId); }

  @Get('revenue-trend')
  revenueTrend(@CurrentUser() u: JwtUser) { return this.service.revenueTrend(u.tenantId); }
}
