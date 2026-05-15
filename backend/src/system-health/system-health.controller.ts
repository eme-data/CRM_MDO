import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemHealthService } from './system-health.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('System health')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('system-health')
export class SystemHealthController {
  constructor(private readonly service: SystemHealthService) {}

  @Roles('ADMIN', 'MANAGER')
  @Get()
  check() {
    return this.service.check();
  }

  @Roles('ADMIN', 'MANAGER')
  @Get('summary')
  summary() {
    return this.service.summary();
  }
}
