import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SurveillanceService } from './surveillance.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Surveillance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('surveillance')
export class SurveillanceController {
  constructor(private readonly service: SurveillanceService) {}

  @Roles('ADMIN', 'MANAGER')
  @Post('run-now')
  runNow() { return this.service.runNow(); }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('probe/:assetId')
  probe(@Param('assetId') id: string) { return this.service.probeOne(id); }
}
