import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AlertSeverity, AlertSource, SocService } from './soc.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('SOC')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('soc')
export class SocController {
  constructor(private readonly service: SocService) {}

  @Get('alerts')
  list(
    @Query('companyId') companyId?: string,
    @Query('severity') severity?: AlertSeverity,
    @Query('sources') sources?: string,
  ) {
    return this.service.listOpen({
      companyId,
      severity,
      sources: sources ? (sources.split(',') as AlertSource[]) : undefined,
    });
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }
}
