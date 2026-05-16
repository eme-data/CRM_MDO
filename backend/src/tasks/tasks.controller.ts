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
import { TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('status') status?: TaskStatus,
    @Query('assigneeId') assigneeId?: string,
    @Query('companyId') companyId?: string,
    @Query('contractId') contractId?: string,
  ) {
    return this.service.findAll({ status, assigneeId, companyId, contractId }, user.tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user.tenantId);
  }

  @Post()
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: JwtUser) {
    return this.service.create(dto, user.id, user.tenantId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @CurrentUser() user: JwtUser) {
    return this.service.update(id, dto, user.tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user.tenantId);
  }
}
