import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProfitabilityService } from './profitability.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Profitability')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('profitability')
export class ProfitabilityController {
  constructor(private readonly service: ProfitabilityService) {}

  @Roles('ADMIN', 'MANAGER')
  @Get('companies/:id')
  forCompany(@Param('id') id: string, @CurrentUser() user: JwtUser, @Query('months') months?: string) {
    const m = months ? Math.max(1, Math.min(36, parseInt(months, 10))) : 12;
    return this.service.computeForCompany(id, user, m);
  }

  @Roles('ADMIN', 'MANAGER')
  @Get('overview')
  overview(@CurrentUser() user: JwtUser, @Query('months') months?: string) {
    const m = months ? Math.max(1, Math.min(36, parseInt(months, 10))) : 12;
    return this.service.overview(user, m);
  }
}
