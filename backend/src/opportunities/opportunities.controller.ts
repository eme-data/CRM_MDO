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
import { OpportunityStage } from '@prisma/client';
import { OpportunitiesService } from './opportunities.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Opportunities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly service: OpportunitiesService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('stage') stage?: OpportunityStage,
    @Query('companyId') companyId?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.service.findAll({ search, stage, companyId, ownerId });
  }

  @Get('kanban')
  kanban() {
    return this.service.kanban();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post()
  create(@Body() dto: CreateOpportunityDto, @CurrentUser() user: JwtUser) {
    return this.service.create(dto, user.id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOpportunityDto, @CurrentUser() user: JwtUser) {
    return this.service.update(id, dto, user.id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user.id);
  }
}
