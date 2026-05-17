import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TicketCategory, TicketPriority } from '@prisma/client';
import { AiService } from './ai.service';
import { TicketTriageService } from './use-cases/ticket-triage.service';
import { TicketDraftService } from './use-cases/ticket-draft.service';
import { TicketSummaryService } from './use-cases/ticket-summary.service';
import { ClientSummaryService } from './use-cases/client-summary.service';
import { DocumentExtractService } from './use-cases/document-extract.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly triage: TicketTriageService,
    private readonly draft: TicketDraftService,
    private readonly ticketSummary: TicketSummaryService,
    private readonly summary: ClientSummaryService,
    private readonly documentExtract: DocumentExtractService,
  ) {}

  @Get('status')
  async status() {
    return { enabled: await this.ai.isEnabled() };
  }

  @Get('usage')
  @Roles('ADMIN', 'MANAGER')
  usage() {
    return this.ai.usageStats();
  }

  // ---------- Triage ticket ----------
  // Scope tenant : on passe user.tenantId pour que le service filtre Prisma
  // par tenantId — sinon un user pouvait declencher de l'IA sur les tickets
  // d'autres tenants via UUID guessing.
  @Post('triage/ticket/:id')
  triageTicket(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.triage.triage(id, user.tenantId, user.id);
  }

  @Post('triage/ticket/:id/apply')
  applyTriage(
    @Param('id') id: string,
    @Body() body: { category?: TicketCategory; priority?: TicketPriority },
    @CurrentUser() user: JwtUser,
  ) {
    return this.triage.applyTriage(id, body, user.tenantId, user.id);
  }

  // ---------- Draft reponse ticket ----------
  @Post('draft/ticket/:id')
  draftTicket(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.draft.draftReply(id, user.tenantId, user.id);
  }

  // ---------- Resume thread ticket (avant de repondre sur un fil long) ----------
  @Post('summary/ticket/:id')
  summarizeTicket(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.ticketSummary.summarizeThread(id, user.tenantId, user.id);
  }

  // ---------- Extraction OCR / IA d'un document GED ----------
  @Post('extract/document/:id')
  extractDocument(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.documentExtract.extract(id, user.tenantId, user.id);
  }

  // ---------- Resume client ----------
  @Post('summary/company/:id')
  summarizeCompany(
    @Param('id') id: string,
    @Query('days') days: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    const d = days ? Math.max(1, Math.min(180, parseInt(days, 10))) : 30;
    return this.summary.summarize(id, user.tenantId, d, user.id);
  }
}
