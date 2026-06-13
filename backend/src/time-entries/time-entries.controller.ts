import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { TimeEntriesService } from './time-entries.service';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('TimeEntries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('time-entries')
export class TimeEntriesController {
  constructor(private readonly service: TimeEntriesService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('userId') userId?: string,
    @Query('ticketId') ticketId?: string,
    @Query('interventionId') interventionId?: string,
    @Query('contractId') contractId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll({ userId, ticketId, interventionId, contractId, from, to }, user.tenantId);
  }

  @Get('summary')
  summary(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
  ) {
    return this.service.summary({ from, to, userId }, user);
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
    return this.service.startTimer(user.id, body, user.tenantId);
  }

  @Post('stop')
  stop(
    @CurrentUser() user: JwtUser,
    @Body() body?: { idleMinutes?: number },
  ) {
    return this.service.stopTimer(user.id, { idleMinutes: body?.idleMinutes });
  }

  @Post()
  create(@Body() dto: CreateTimeEntryDto, @CurrentUser() user: JwtUser) {
    return this.service.create(user.id, dto, user.tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTimeEntryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, user.id, dto, user.tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user.id, user.role, user.tenantId);
  }

  // ============================================================
  // Endpoints FACTURATION (ADMIN/MANAGER)
  // ============================================================
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('billing/by-company')
  billingByCompany(
    @CurrentUser() user: JwtUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('onlyUnbilled') onlyUnbilled?: string,
  ) {
    if (!from || !to) throw new BadRequestException('from et to requis (YYYY-MM-DD)');
    return this.service.billingByCompany({ from, to, onlyUnbilled: onlyUnbilled === 'true' }, user);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('billing/companies/:companyId')
  billingDetail(
    @Param('companyId') companyId: string,
    @CurrentUser() user: JwtUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('onlyUnbilled') onlyUnbilled?: string,
  ) {
    if (!from || !to) throw new BadRequestException('from et to requis (YYYY-MM-DD)');
    return this.service.billingDetail({ companyId, from, to, onlyUnbilled: onlyUnbilled === 'true' }, user);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('billing/companies/:companyId/export.csv')
  async exportCsv(
    @Param('companyId') companyId: string,
    @CurrentUser() user: JwtUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('onlyUnbilled') onlyUnbilled?: string,
    @Res() res?: Response,
  ) {
    if (!from || !to) throw new BadRequestException('from et to requis (YYYY-MM-DD)');
    const csv = await this.service.exportCsv({
      companyId, from, to, onlyUnbilled: onlyUnbilled === 'true',
    }, user);
    res!.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res!.setHeader('Content-Disposition', `attachment; filename="time-${companyId}-${from}-${to}.csv"`);
    res!.send(csv);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('billing/mark-invoiced')
  markInvoiced(
    @Body() body: { ids: string[]; invoiceReference?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.markInvoiced(body.ids ?? [], user.id, user.tenantId, body.invoiceReference);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('billing/unmark-invoiced')
  unmarkInvoiced(@Body() body: { ids: string[] }, @CurrentUser() user: JwtUser) {
    return this.service.unmarkInvoiced(body.ids ?? [], user.tenantId);
  }
}
