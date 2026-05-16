import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UptimeService } from './uptime.service';
import { CreateMonitorDto } from './dto/create-monitor.dto';
import { UpdateMonitorDto } from './dto/update-monitor.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Uptime')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('uptime')
export class UptimeController {
  constructor(private readonly service: UptimeService) {}

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Get('overview')
  overview(@CurrentUser() user: JwtUser) {
    return this.service.overview(user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Get()
  list(@CurrentUser() user: JwtUser, @Query('companyId') companyId?: string) {
    return this.service.list(user, companyId);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.getDetail(id, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() dto: CreateMonitorDto, @CurrentUser() user: JwtUser) {
    return this.service.create(dto, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMonitorDto, @CurrentUser() user: JwtUser) {
    return this.service.update(id, dto, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post(':id/check')
  check(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.checkOne(id, user);
  }

  @Roles('ADMIN')
  @Post('run-all')
  runAll() {
    return this.service.tick();
  }
}
