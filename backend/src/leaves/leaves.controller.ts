import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LeavesService } from './leaves.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { DecideLeaveDto } from './dto/decide-leave.dto';
import { SetAllocationDto } from './dto/set-allocation.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

// SIRH - Conges & absences. Tout collaborateur authentifie peut creer/consulter
// SES demandes ; les ADMIN/MANAGER valident et gerent les soldes.
@ApiTags('Conges (SIRH)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leaves')
export class LeavesController {
  constructor(private readonly service: LeavesService) {}

  @Get('types')
  types(@CurrentUser() user: JwtUser) {
    return this.service.listTypes(user);
  }

  @Get('mine')
  mine(@CurrentUser() user: JwtUser) {
    return this.service.listMine(user);
  }

  @Get('balances')
  myBalances(@CurrentUser() user: JwtUser, @Query('year') year?: string) {
    return this.service.myBalances(user, year ? Number(year) : undefined);
  }

  @Get('team-upcoming')
  teamUpcoming(@CurrentUser() user: JwtUser) {
    return this.service.teamUpcoming(user);
  }

  @Post()
  create(@Body() dto: CreateLeaveDto, @CurrentUser() user: JwtUser) {
    return this.service.create(dto, user);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.cancel(id, user);
  }

  // ----- Valideurs (ADMIN / MANAGER) -----
  @Roles('ADMIN', 'MANAGER')
  @Get('pending')
  pending(@CurrentUser() user: JwtUser) {
    return this.service.listPending(user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post(':id/decide')
  decide(@Param('id') id: string, @Body() dto: DecideLeaveDto, @CurrentUser() user: JwtUser) {
    return this.service.decide(id, dto, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Get('balances/all')
  allBalances(@CurrentUser() user: JwtUser, @Query('year') year?: string) {
    return this.service.allBalances(user, year ? Number(year) : undefined);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('allocations')
  setAllocation(@Body() dto: SetAllocationDto, @CurrentUser() user: JwtUser) {
    return this.service.setAllocation(dto, user);
  }
}
