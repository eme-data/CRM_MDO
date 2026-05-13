import {
  BadRequestException,
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
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { PortalAuthGuard } from './guards/portal-auth.guard';
import { PortalPublic } from './decorators/portal-public.decorator';
import { CurrentPortalUser, PortalUser } from './decorators/current-portal-user.decorator';
import { PortalAuthService } from './portal-auth.service';
import { PortalDataService } from './portal-data.service';

// Tout le portail client est sous `/portal/*`. On marque `@Public()` au niveau
// controller pour BYPASSER les guards globaux (JwtAuth, MfaRequired, Roles),
// puis on applique localement `PortalAuthGuard` qui exige une session portail
// (sauf sur les routes `@PortalPublic()`).

@ApiTags('Portal')
@Public()
@UseGuards(PortalAuthGuard)
@Controller('portal')
export class PortalController {
  constructor(
    private readonly portalAuth: PortalAuthService,
    private readonly data: PortalDataService,
  ) {}

  // ============================================================
  // Authentification portail (public)
  // ============================================================

  // Rate-limit strict : empeche l'enumeration et le spam d'envoi de mail.
  @PortalPublic()
  @Throttle({ auth: { limit: 5, ttl: 300_000 } })
  @Post('auth/request-magic-link')
  async requestMagicLink(@Body() body: { email: string }) {
    if (!body?.email) throw new BadRequestException('Email requis.');
    return this.portalAuth.requestMagicLink(body.email);
  }

  @PortalPublic()
  @Throttle({ auth: { limit: 20, ttl: 300_000 } })
  @Post('auth/verify')
  async verify(@Body() body: { token: string }, @Req() req: Request) {
    if (!body?.token) throw new BadRequestException('Token requis.');
    return this.portalAuth.verifyMagicLink(body.token, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('auth/logout')
  async logout(@Req() req: Request) {
    const token = (req.headers['x-portal-session'] as string | undefined)
      ?? (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined);
    if (token) await this.portalAuth.revokeSession(token);
    return { ok: true };
  }

  @Get('auth/me')
  me(@CurrentPortalUser() user: PortalUser) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      company: user.company,
    };
  }

  // ============================================================
  // Contrats
  // ============================================================
  @Get('contracts')
  contracts(@CurrentPortalUser() user: PortalUser) {
    return this.data.listContracts(user.companyId);
  }

  // ============================================================
  // Tickets
  // ============================================================
  @Get('tickets')
  listTickets(
    @CurrentPortalUser() user: PortalUser,
    @Query('status') status?: string,
  ) {
    return this.data.listTickets(user.companyId, { status });
  }

  @Get('tickets/:id')
  getTicket(@CurrentPortalUser() user: PortalUser, @Param('id') id: string) {
    return this.data.getTicket(user.companyId, id);
  }

  @Post('tickets')
  createTicket(
    @CurrentPortalUser() user: PortalUser,
    @Body() body: { title: string; description: string; priority?: any; category?: any },
  ) {
    return this.data.createTicket(user.companyId, user, body);
  }

  @Post('tickets/:id/messages')
  replyTicket(
    @CurrentPortalUser() user: PortalUser,
    @Param('id') id: string,
    @Body() body: { content: string },
  ) {
    return this.data.replyToTicket(user.companyId, user, id, body);
  }

  // ============================================================
  // Assets surveilles (lecture seule)
  // ============================================================
  @Get('assets')
  assets(@CurrentPortalUser() user: PortalUser) {
    return this.data.listAssets(user.companyId);
  }
}
