import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MonitoringService } from './monitoring.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly service: MonitoringService) {}

  // Verification a la demande sur un asset (bouton "Verifier maintenant")
  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('assets/:id/check')
  check(@Param('id') id: string) {
    return this.service.checkOne(id);
  }

  // Lance une passe complete sur tous les assets monitorables (admin)
  @Roles('ADMIN')
  @Post('run-all')
  runAll() {
    return this.service.dailyMonitor();
  }
}
