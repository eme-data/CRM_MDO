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
import { TimeEntriesService } from './time-entries.service';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('TimeEntries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('time-entries')
export class TimeEntriesController {
  constructor(private readonly service: TimeEntriesService) {}

  @Get()
  findAll(
    @Query('userId') userId?: string,
    @Query('ticketId') ticketId?: string,
    @Query('interventionId') interventionId?: string,
    @Query('contractId') contractId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll({ userId, ticketId, interventionId, contractId, from, to });
  }

  @Get('summary')
  summary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
  ) {
    return this.service.summary({ from, to, userId });
  }

  @Get('current')
  current(@CurrentUser() user: JwtUser) {
    return this.service.currentTimer(user.id);
  }

  @Post('start')
  start(
    @Body() body: { ticketId?: string; interventionId?: string; description?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.startTimer(user.id, body);
  }

  @Post('stop')
  stop(@CurrentUser() user: JwtUser) {
    return this.service.stopTimer(user.id);
  }

  @Post()
  create(@Body() dto: CreateTimeEntryDto, @CurrentUser() user: JwtUser) {
    return this.service.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTimeEntryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user.id, user.role);
  }
}
