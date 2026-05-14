import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { RecurringTasksService } from './recurring-tasks.service';
import {
  CreateRecurringTaskTemplateDto,
  UpdateRecurringTaskTemplateDto,
} from './dto/recurring-task-template.dto';

@ApiTags('RecurringTasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('recurring-tasks')
export class RecurringTasksController {
  constructor(private readonly service: RecurringTasksService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() dto: CreateRecurringTaskTemplateDto, @CurrentUser() user: JwtUser) {
    return this.service.create(dto, user.id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRecurringTaskTemplateDto) {
    return this.service.update(id, dto);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post(':id/run-now')
  runNow(@Param('id') id: string) {
    return this.service.runNow(id);
  }
}
