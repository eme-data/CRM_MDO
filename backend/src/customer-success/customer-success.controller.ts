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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CustomerSuccessReviewStatus } from '@prisma/client';
import { CustomerSuccessService } from './customer-success.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Customer Success')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customer-success')
export class CustomerSuccessController {
  constructor(private readonly service: CustomerSuccessService) {}

  @Get()
  list(
    @Query('companyId') companyId?: string,
    @Query('status') status?: CustomerSuccessReviewStatus,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.service.list({ companyId, status, ownerId });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post()
  create(@Body() body: { companyId: string; scheduledAt: string; ownerId?: string }) {
    return this.service.createManual(body);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post(':id/refresh-agenda')
  refreshAgenda(@Param('id') id: string) {
    return this.service.refreshAgenda(id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
