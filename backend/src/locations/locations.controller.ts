import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LocationsService, UpsertLocationDto } from './locations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Locations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('locations')
export class LocationsController {
  constructor(private readonly service: LocationsService) {}

  @Get()
  list(@Query('companyId') companyId: string) {
    return this.service.listForCompany(companyId);
  }

  @Get(':id')
  one(@Param('id') id: string) { return this.service.findOne(id); }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post()
  create(@Body() dto: UpsertLocationDto) { return this.service.create(dto); }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<UpsertLocationDto>) {
    return this.service.update(id, dto);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}
