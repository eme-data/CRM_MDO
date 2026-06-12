import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { HrDashboardService } from './hr-dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Dashboard RH (SIRH)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hr-dashboard')
export class HrDashboardController {
  constructor(private readonly service: HrDashboardService) {}

  @Roles('ADMIN', 'MANAGER')
  @Get()
  summary(@CurrentUser() user: JwtUser) {
    return this.service.summary(user);
  }
}
