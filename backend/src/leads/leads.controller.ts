import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AllowMfaPending } from '../common/decorators/allow-mfa-pending.decorator';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';

@ApiTags('Leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly service: LeadsService) {}

  // Endpoint public d'acquisition. Rate-limit serre : 5 leads / 5 min par IP.
  // Au-dela = vraisemblablement bot / attaque, le throttler retourne 429.
  // @Public + @AllowMfaPending pour bypasser respectivement JwtAuthGuard et
  // MfaRequiredGuard (cf app.module.ts : ces guards sont globaux).
  @Public()
  @AllowMfaPending()
  @Throttle({ auth: { limit: 5, ttl: 300_000 } })
  @HttpCode(202)
  @Post()
  async create(@Body() dto: CreateLeadDto, @Req() req: Request) {
    // Multi-tenant : le tenant est resolu par le TenantResolverMiddleware
    // depuis le Host (ex: contact.mairie-seysses.fr -> tenant Seysses).
    // Si la requete n'a pas de tenant resolu, le lead atterrit dans le
    // tenant par defaut (le legacy MDO via retro-compat seed).
    return this.service.createFromPublic(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      tenantId: req.tenant?.id ?? null,
    });
  }
}
