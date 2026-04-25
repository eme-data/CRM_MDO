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
import {
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from '@prisma/client';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { AddMessageDto } from './dto/add-message.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly service: TicketsService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('status') status?: TicketStatus,
    @Query('priority') priority?: TicketPriority,
    @Query('category') category?: TicketCategory,
    @Query('companyId') companyId?: string,
    @Query('assigneeId') assigneeId?: string,
  ) {
    return this.service.findAll({
      search,
      status,
      priority,
      category,
      companyId,
      assigneeId,
    });
  }

  @Get('kanban')
  kanban(
    @Query('assigneeId') assigneeId?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.service.kanban({ assigneeId, companyId });
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post()
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: JwtUser) {
    return this.service.create(dto, user.id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post(':id/messages')
  addMessage(
    @Param('id') id: string,
    @Body() dto: AddMessageDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.addMessage(id, dto, user.id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user.id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('bulk-update')
  bulkUpdate(
    @Body() body: { ids: string[]; status?: TicketStatus; priority?: TicketPriority; assigneeId?: string | null },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.bulkUpdate(body.ids, body, user.id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('bulk-delete')
  bulkDelete(
    @Body() body: { ids: string[] },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.bulkDelete(body.ids, user.id);
  }
}
