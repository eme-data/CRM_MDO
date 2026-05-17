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
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { CreateCustomerSuccessReviewDto, UpdateCustomerSuccessReviewDto } from './dto/customer-success.dto';

@ApiTags('Customer Success')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customer-success')
export class CustomerSuccessController {
  constructor(private readonly service: CustomerSuccessService) {}

  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Query('companyId') companyId?: string,
    @Query('status') status?: CustomerSuccessReviewStatus,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.service.list(user, { companyId, status, ownerId });
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post()
  create(@Body() body: CreateCustomerSuccessReviewDto, @CurrentUser() user: JwtUser) {
    return this.service.createManual(body, user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateCustomerSuccessReviewDto, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post(':id/refresh-agenda')
  refreshAgenda(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.refreshAgenda(id, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
