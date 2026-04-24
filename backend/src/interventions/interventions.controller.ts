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
import { InterventionStatus } from '@prisma/client';
import { InterventionsService } from './interventions.service';
import { CreateInterventionDto } from './dto/create-intervention.dto';
import { UpdateInterventionDto } from './dto/update-intervention.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Interventions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('interventions')
export class InterventionsController {
  constructor(private readonly service: InterventionsService) {}

  @Get()
  findAll(
    @Query('status') status?: InterventionStatus,
    @Query('companyId') companyId?: string,
    @Query('contractId') contractId?: string,
    @Query('technicianId') technicianId?: string,
  ) {
    return this.service.findAll({ status, companyId, contractId, technicianId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateInterventionDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInterventionDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
