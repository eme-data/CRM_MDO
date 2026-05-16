import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PatchManagementService } from './patch-management.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Patch management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('patch-management')
export class PatchManagementController {
  constructor(private readonly service: PatchManagementService) {}

  @Get('devices')
  list(
    @CurrentUser() user: JwtUser,
    @Query('companyId') companyId?: string,
    @Query('complianceState') complianceState?: string,
  ) {
    return this.service.list(user, { companyId, complianceState });
  }

  @Get('stats')
  stats(@CurrentUser() user: JwtUser) {
    return this.service.stats(user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('tenants/:tenantId/sync')
  sync(@Param('tenantId') tenantId: string, @CurrentUser() user: JwtUser) {
    return this.service.syncTenant(tenantId, user);
  }
}
