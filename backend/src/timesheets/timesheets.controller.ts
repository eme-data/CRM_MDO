import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TimesheetsService } from './timesheets.service';
import { DecideTimesheetDto } from './dto/decide-timesheet.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Feuilles de temps (SIRH)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('timesheets')
export class TimesheetsController {
  constructor(private readonly service: TimesheetsService) {}

  // Semaine courante ou ?week=YYYY-MM-DD (n'importe quel jour de la semaine).
  @Get('week')
  week(@CurrentUser() user: JwtUser, @Query('week') week?: string) {
    return this.service.weekSummary(user, week);
  }

  @Get('mine')
  mine(@CurrentUser() user: JwtUser) {
    return this.service.listMine(user);
  }

  @Post('submit')
  submit(@Body() body: { week?: string }, @CurrentUser() user: JwtUser) {
    return this.service.submit(user, body?.week);
  }

  // ----- Valideurs -----
  @Roles('ADMIN', 'MANAGER')
  @Get('pending')
  pending(@CurrentUser() user: JwtUser) {
    return this.service.listPending(user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post(':id/decide')
  decide(@Param('id') id: string, @Body() dto: DecideTimesheetDto, @CurrentUser() user: JwtUser) {
    return this.service.decide(id, dto, user);
  }
}
