import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlanningService } from './planning.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Planning equipe (SIRH)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('planning')
export class PlanningController {
  constructor(private readonly service: PlanningService) {}

  // ?month=YYYY-MM (defaut : mois courant).
  @Get()
  month(@CurrentUser() user: JwtUser, @Query('month') month?: string) {
    return this.service.month(user, month);
  }
}
