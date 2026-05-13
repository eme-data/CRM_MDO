import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UptimeService } from './uptime.service';
import { CreateMonitorDto } from './dto/create-monitor.dto';
import { UpdateMonitorDto } from './dto/update-monitor.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Uptime')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('uptime')
export class UptimeController {
  constructor(private readonly service: UptimeService) {}

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Get('overview')
  overview() {
    return this.service.overview();
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Get()
  list(@Query('companyId') companyId?: string) {
    return this.service.list(companyId);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getDetail(id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() dto: CreateMonitorDto) {
    return this.service.create(dto);
  }

  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMonitorDto) {
    return this.service.update(id, dto);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post(':id/check')
  check(@Param('id') id: string) {
    return this.service.checkOne(id);
  }

  @Roles('ADMIN')
  @Post('run-all')
  runAll() {
    return this.service.tick();
  }
}
