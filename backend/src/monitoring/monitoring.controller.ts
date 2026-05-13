import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MonitoringService } from './monitoring.service';
import { auditDns } from './dns-audit';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly service: MonitoringService) {}

  // Vue consolidee : stats + buckets d'expiration + erreurs (page Surveillance)
  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Get('overview')
  overview() {
    return this.service.overview();
  }

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

  // Declenche manuellement le recap hebdomadaire (test SMTP)
  @Roles('ADMIN')
  @Post('digest/run')
  runDigest() {
    return this.service.weeklyDigest();
  }

  // Audit DNS (MX / SPF / DMARC) sur un domaine arbitraire
  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('dns-audit')
  dnsAudit(@Body() body: { domain?: string }) {
    if (!body?.domain || typeof body.domain !== 'string') {
      throw new BadRequestException('Champ domain requis');
    }
    return auditDns(body.domain);
  }
}
