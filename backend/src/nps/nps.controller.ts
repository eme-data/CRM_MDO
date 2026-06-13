import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { NpsService } from './nps.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('NPS')
@Controller()
export class NpsController {
  constructor(private readonly service: NpsService) {}

  // ============================================================
  // Endpoints PUBLICS (token-based)
  // ============================================================
  @Public()
  @Throttle({ short: { limit: 30, ttl: 60_000 } })
  @Get('nps/:token')
  getByToken(@Param('token') token: string) {
    return this.service.getByToken(token);
  }

  @Public()
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @Post('nps/:token/submit')
  submit(
    @Param('token') token: string,
    @Body() body: { score: number; comment?: string },
    @Req() req: Request,
  ) {
    return this.service.submit(token, body.score, body.comment, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  // ============================================================
  // Endpoints ADMIN
  // ============================================================
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Get('tickets/:ticketId/nps')
  getForTicket(@Param('ticketId') ticketId: string, @CurrentUser() user: JwtUser) {
    return this.service.getForTicket(ticketId, user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.MANAGER, Role.SALES)
  @Post('tickets/:ticketId/nps/send')
  sendForTicket(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: JwtUser,
    @Body() body: { force?: boolean; to?: string } = {},
  ) {
    return this.service.sendForTicket(
      ticketId,
      { force: body.force === true, overrideTo: body.to },
      user.tenantId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('nps/stats')
  stats(@CurrentUser() user: JwtUser, @Query('days') days?: string) {
    return this.service.stats(user.tenantId, days ? parseInt(days, 10) : 90);
  }
}
