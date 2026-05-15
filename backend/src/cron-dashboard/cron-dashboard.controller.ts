import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CronDashboardService } from './cron-dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Cron jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cron-jobs')
export class CronDashboardController {
  constructor(private readonly service: CronDashboardService) {}

  @Roles('ADMIN', 'MANAGER')
  @Get()
  list() {
    return this.service.list();
  }

  @Roles('ADMIN', 'MANAGER')
  @Get('history')
  history(@Query('name') name?: string, @Query('limit') limit?: string) {
    return this.service.history(name, limit ? parseInt(limit, 10) : 50);
  }

  @Roles('ADMIN')
  @Post(':name/run')
  runNow(@Param('name') name: string, @CurrentUser() user: JwtUser) {
    return this.service.runNow(name, user.id);
  }
}
