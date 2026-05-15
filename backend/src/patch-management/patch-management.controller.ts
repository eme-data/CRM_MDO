import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PatchManagementService } from './patch-management.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Patch management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patch-management')
export class PatchManagementController {
  constructor(private readonly service: PatchManagementService) {}

  @Get('devices')
  list(
    @Query('companyId') companyId?: string,
    @Query('complianceState') complianceState?: string,
  ) {
    return this.service.list({ companyId, complianceState });
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('tenants/:tenantId/sync')
  sync(@Param('tenantId') tenantId: string) {
    return this.service.syncTenant(tenantId);
  }
}
