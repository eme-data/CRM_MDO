import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AssetLifecycleService, LifecycleStatus } from './asset-lifecycle.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiTags('Asset Lifecycle')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('asset-lifecycle')
export class AssetLifecycleController {
  constructor(private readonly service: AssetLifecycleService) {}

  @Get()
  list(
    @Query('companyId') companyId?: string,
    @Query('status') status?: LifecycleStatus,
  ) {
    return this.service.overview({ companyId, status });
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }
}
