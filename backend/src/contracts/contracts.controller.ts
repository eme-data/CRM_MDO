import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ContractStatus } from '@prisma/client';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { RenewContractDto } from './dto/renew-contract.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contracts')
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('status') status?: ContractStatus,
    @Query('companyId') companyId?: string,
    @Query('expiringInDays') expiringInDays?: string,
  ) {
    return this.service.findAll({
      search,
      status,
      companyId,
      expiringInDays: expiringInDays ? parseInt(expiringInDays, 10) : undefined,
    });
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Get('expiring-soon')
  expiringSoon(@Query('days') days?: string) {
    return this.service.expiringSoon(days ? parseInt(days, 10) : 90);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post()
  create(@Body() dto: CreateContractDto, @CurrentUser() user: JwtUser) {
    return this.service.create(dto, user.id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContractDto, @CurrentUser() user: JwtUser) {
    return this.service.update(id, dto, user.id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post(':id/terminate')
  terminate(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.terminate(id, body.reason, user.id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post(':id/renew')
  renew(@Param('id') id: string, @Body() dto: RenewContractDto, @CurrentUser() user: JwtUser) {
    return this.service.renew(id, dto, user.id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user.id);
  }
}
