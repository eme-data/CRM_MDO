import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JourneyKind } from '@prisma/client';
import { JourneysService } from './journeys.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { CreateJourneyDto } from './dto/create-journey.dto';
import { AddTaskDto, ToggleTaskDto } from './dto/journey-task.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Parcours collaborateur (SIRH)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('journeys')
export class JourneysController {
  constructor(private readonly service: JourneysService) {}

  // ----- Modeles -----
  @Roles('ADMIN', 'MANAGER')
  @Get('templates')
  templates(@CurrentUser() user: JwtUser, @Query('kind') kind?: JourneyKind) {
    return this.service.listTemplates(user, kind);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('templates')
  createTemplate(@Body() dto: CreateTemplateDto, @CurrentUser() user: JwtUser) {
    return this.service.createTemplate(user, dto);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.deleteTemplate(user, id);
  }

  // ----- Parcours -----
  @Get('mine')
  mine(@CurrentUser() user: JwtUser) {
    return this.service.listMine(user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Get()
  managed(@CurrentUser() user: JwtUser) {
    return this.service.listManaged(user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() dto: CreateJourneyDto, @CurrentUser() user: JwtUser) {
    return this.service.create(user, dto);
  }

  // Tache : cochage (declare AVANT :id pour ne pas etre capture par get one).
  @Patch('tasks/:taskId')
  toggleTask(@Param('taskId') taskId: string, @Body() dto: ToggleTaskDto, @CurrentUser() user: JwtUser) {
    return this.service.toggleTask(user, taskId, dto);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete('tasks/:taskId')
  deleteTask(@Param('taskId') taskId: string, @CurrentUser() user: JwtUser) {
    return this.service.deleteTask(user, taskId);
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.getOne(user, id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post(':id/tasks')
  addTask(@Param('id') id: string, @Body() dto: AddTaskDto, @CurrentUser() user: JwtUser) {
    return this.service.addTask(user, id, dto);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.cancel(user, id);
  }
}
