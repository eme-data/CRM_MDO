import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TicketCategory, TicketPriority } from '@prisma/client';
import { AiService } from './ai.service';
import { TicketTriageService } from './use-cases/ticket-triage.service';
import { TicketDraftService } from './use-cases/ticket-draft.service';
import { TicketSummaryService } from './use-cases/ticket-summary.service';
import { ClientSummaryService } from './use-cases/client-summary.service';
import { DocumentExtractService } from './use-cases/document-extract.service';
import { QuoteAssistService } from './use-cases/quote-assist.service';
import { ClientQbrService } from './use-cases/client-qbr.service';
import { AssistantService } from './use-cases/assistant.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

// Rate-limit AI : 20 calls / 5 min par (tenant, ip) — anti DoS economique.
// Chaque call IA coute des tokens Claude (~0.01 $/document-extract sur PDF
// 5MB). Sans throttle, un script pourrait invoquer document-extract 1000x
// en quelques secondes → facture Anthropic exploose. 20/5min = 240/h max,
// largement suffisant pour usage humain normal, casse les abus automatises.
const AI_THROTTLE = { aiCall: { limit: 20, ttl: 300_000 } } as const;

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
    private readonly quoteAssist: QuoteAssistService,
    private readonly clientQbr: ClientQbrService,
    private readonly assistant: AssistantService,
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
  @Throttle(AI_THROTTLE)
  @Post('triage/ticket/:id')
  triageTicket(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.triage.triage(id, user.tenantId, user.id);
  }

  // applyTriage : pas de cout token, juste un UPDATE Prisma → throttle "short"
  // global suffit.
  @Post('triage/ticket/:id/apply')
  applyTriage(
    @Param('id') id: string,
    @Body() body: { category?: TicketCategory; priority?: TicketPriority },
    @CurrentUser() user: JwtUser,
  ) {
    return this.triage.applyTriage(id, body, user.tenantId, user.id);
  }

  // ---------- Draft reponse ticket ----------
  @Throttle(AI_THROTTLE)
  @Post('draft/ticket/:id')
  draftTicket(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.draft.draftReply(id, user.tenantId, user.id);
  }

  // ---------- Resume thread ticket (avant de repondre sur un fil long) ----------
  @Throttle(AI_THROTTLE)
  @Post('summary/ticket/:id')
  summarizeTicket(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.ticketSummary.summarizeThread(id, user.tenantId, user.id);
  }

  // ---------- Extraction OCR / IA d'un document GED ----------
  // Le plus couteux des endpoints AI (Claude Vision sur PDF 5MB ≈ 0.01 $/call).
  // Throttle AI strict applique.
  @Throttle(AI_THROTTLE)
  @Post('extract/document/:id')
  extractDocument(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.documentExtract.extract(id, user.tenantId, user.id);
  }

  // ---------- Resume client ----------
  @Throttle(AI_THROTTLE)
  @Post('summary/company/:id')
  summarizeCompany(
    @Param('id') id: string,
    @Query('days') days: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    const d = days ? Math.max(1, Math.min(180, parseInt(days, 10))) : 30;
    return this.summary.summarize(id, user.tenantId, d, user.id);
  }

  // ---------- Devis assiste (genere des lignes depuis une description) ----------
  @Throttle(AI_THROTTLE)
  @Post('quote/assist')
  quoteAssistGenerate(@Body() body: { description: string }, @CurrentUser() user: JwtUser) {
    return this.quoteAssist.assist(body?.description ?? '', user.tenantId, user.id);
  }

  // ---------- QBR / bilan client (markdown presentable) ----------
  @Throttle(AI_THROTTLE)
  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('qbr/company/:id')
  qbrCompany(
    @Param('id') id: string,
    @Query('days') days: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    const d = days ? Math.max(30, Math.min(365, parseInt(days, 10))) : 90;
    return this.clientQbr.generate(id, user.tenantId, d, user.id);
  }

  // ---------- Assistant conversationnel (agent tool-use, lecture seule) ----------
  @Throttle(AI_THROTTLE)
  @Post('assistant')
  assistantAsk(@Body() body: { question: string }, @CurrentUser() user: JwtUser) {
    return this.assistant.ask(body?.question ?? '', user.tenantId, user.id);
  }
}
