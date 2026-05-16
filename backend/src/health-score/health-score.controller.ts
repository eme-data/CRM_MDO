import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { HealthScoreService } from './health-score.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Health Score')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('health-score')
export class HealthScoreController {
  constructor(private readonly service: HealthScoreService) {}

  @Get('companies/:id')
  forCompany(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.computeForCompany(id, user);
  }

  @Get('overview')
  overview(@CurrentUser() user: JwtUser, @Query('limit') limit?: string) {
    return this.service.overview(user, limit ? parseInt(limit, 10) : 50);
  }
}
