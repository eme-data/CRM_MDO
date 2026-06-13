import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AiCapability } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { callAnthropic, estimateCostUsd, AnthropicContentBlock, AnthropicMessage, AnthropicTool, AnthropicResponse } from './anthropic.client';

interface InvokeParams {
  capability: AiCapability;
  systemPrompt: string;
  // Texte simple (cas habituel) OU blocs typés (image + texte pour Claude
  // Vision, document PDF + texte pour extraction documentaire).
  userMessage: string | AnthropicContentBlock[];
  // Si vrai (defaut), le system prompt est cache (ephemeral 5 min). Mettre
  // false pour les invocations one-shot dont le system varie a chaque fois.
  cacheSystem?: boolean;
  maxTokens?: number;
  temperature?: number;
  // Force un modele specifique pour cette invocation (ex: Opus 4.8 pour les
  // taches a forte valeur : devis assiste, QBR), au lieu du modele du tenant.
  // Le tenant paie quand meme avec sa propre cle.
  modelOverride?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  // Multi-tenant : OBLIGATOIRE si l'invocation se fait dans un contexte
  // tenant. La cle Anthropic + le model + le companyContext sont resolus PAR
  // tenant — sinon on ferait l'appel avec la cle MDO et factures sur compte
  // MDO meme pour les tenants clients.
  tenantId?: string | null;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async isEnabled(tenantId: string | null = null): Promise<boolean> {
    return this.settings.getBool('ai.enabled', tenantId);
  }

  // ============================================================
  // Resolution clef + modele + contexte company - PAR TENANT.
  // Critique : sans tenantId, on lit la config GLOBAL (= MDO) — un tenant
  // client utiliserait la cle Anthropic MDO et les couts seraient factures
  // a MDO. La cle API est isSecret donc PAS de fallback global pour les
  // tenants (cf SettingsService.get).
  // ============================================================
  private async loadConfig(tenantId: string | null) {
    const enabled = await this.settings.getBool('ai.enabled', tenantId);
    if (!enabled) {
      throw new ServiceUnavailableException('IA desactivee (Settings > IA > Activer)');
    }
    const apiKey = await this.settings.get('ai.apiKey', tenantId);
    if (!apiKey) {
      throw new BadRequestException(
        tenantId
          ? 'Cle API Anthropic non configuree pour ce tenant (Settings > IA)'
          : 'Cle API Anthropic non configuree',
      );
    }
    const model = (await this.settings.get('ai.model', tenantId)) ?? 'claude-sonnet-4-6';
    const companyContext = (await this.settings.get('ai.companyContext', tenantId)) ?? '';
    return { apiKey, model, companyContext };
  }

  // ============================================================
  // Wrapper bas-niveau : appelle l'API + log AiUsage
  // Le system prompt final = "<companyContext>\n\n<systemPrompt>".
  // ============================================================
  async invoke(params: InvokeParams): Promise<string> {
    const cfg = await this.loadConfig(params.tenantId ?? null);
    const { apiKey, companyContext } = cfg;
    const model = params.modelOverride ?? cfg.model;
    const fullSystem = (companyContext ? companyContext + '\n\n' : '') + params.systemPrompt;
    const start = Date.now();
    let result;
    try {
      result = await callAnthropic({
        apiKey,
        model,
        systemPrompt: fullSystem,
        cacheSystem: params.cacheSystem !== false,
        // userMessage peut etre une string OU des blocs typés (image, document).
        // L'API Anthropic accepte les deux formats sur le meme champ content.
        messages: [{ role: 'user', content: params.userMessage as any }],
        maxTokens: params.maxTokens ?? 1024,
        temperature: params.temperature,
      });
    } catch (err: any) {
      const durationMs = Date.now() - start;
      await this.prisma.aiUsage
        .create({
          data: {
            tenantId: params.tenantId,
            capability: params.capability,
            model,
            errorMessage: err.message?.slice(0, 500),
            durationMs,
            entityType: params.entityType,
            entityId: params.entityId,
            userId: params.userId,
          },
        })
        .catch(() => {}); // ne pas masquer l'erreur originale
      throw err;
    }

    const durationMs = Date.now() - start;
    const cost = estimateCostUsd(model, result.usage);

    await this.prisma.aiUsage
      .create({
        data: {
          tenantId: params.tenantId,
          capability: params.capability,
          model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cacheReadTokens: result.usage.cacheReadTokens,
          cacheCreationTokens: result.usage.cacheCreationTokens,
          costUsd: cost,
          durationMs,
          entityType: params.entityType,
          entityId: params.entityId,
          userId: params.userId,
        },
      })
      .catch((e) => this.logger.warn('AiUsage log failed: ' + e.message));

    return result.text;
  }

  // ============================================================
  // Appel bas-niveau avec historique de messages + outils (agent tool-use).
  // Retourne la reponse complete (text + content brut + toolUses + stopReason)
  // pour piloter une boucle agentique. Log l'usage comme invoke().
  // ============================================================
  async callModel(opts: {
    tenantId: string | null;
    capability: AiCapability;
    systemPrompt: string;
    messages: AnthropicMessage[];
    tools?: AnthropicTool[];
    maxTokens?: number;
    modelOverride?: string;
    userId?: string;
    entityType?: string;
    entityId?: string;
  }): Promise<AnthropicResponse> {
    const cfg = await this.loadConfig(opts.tenantId ?? null);
    const model = opts.modelOverride ?? cfg.model;
    const fullSystem = (cfg.companyContext ? cfg.companyContext + '\n\n' : '') + opts.systemPrompt;
    const start = Date.now();
    let result: AnthropicResponse;
    try {
      result = await callAnthropic({
        apiKey: cfg.apiKey,
        model,
        systemPrompt: fullSystem,
        cacheSystem: true,
        messages: opts.messages,
        tools: opts.tools,
        maxTokens: opts.maxTokens ?? 1024,
      });
    } catch (err: any) {
      await this.prisma.aiUsage
        .create({
          data: {
            tenantId: opts.tenantId, capability: opts.capability, model,
            errorMessage: err.message?.slice(0, 500), durationMs: Date.now() - start,
            entityType: opts.entityType, entityId: opts.entityId, userId: opts.userId,
          },
        })
        .catch(() => {});
      throw err;
    }
    await this.prisma.aiUsage
      .create({
        data: {
          tenantId: opts.tenantId, capability: opts.capability, model,
          inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens,
          cacheReadTokens: result.usage.cacheReadTokens, cacheCreationTokens: result.usage.cacheCreationTokens,
          costUsd: estimateCostUsd(model, result.usage), durationMs: Date.now() - start,
          entityType: opts.entityType, entityId: opts.entityId, userId: opts.userId,
        },
      })
      .catch((e) => this.logger.warn('AiUsage log failed: ' + e.message));
    return result;
  }

  // ============================================================
  // Stats consommation (admin) - par tenant
  // ============================================================
  async usageStats(tenantId: string | null = null) {
    const since = new Date(Date.now() - 30 * 86400_000);
    const tenantScope = tenantId ? { tenantId } : {};
    const [total, byCap] = await Promise.all([
      this.prisma.aiUsage.aggregate({
        where: { ...tenantScope, createdAt: { gte: since } },
        _sum: { inputTokens: true, outputTokens: true, costUsd: true },
        _count: true,
      }),
      this.prisma.aiUsage.groupBy({
        by: ['capability'],
        where: { ...tenantScope, createdAt: { gte: since } },
        _sum: { costUsd: true },
        _count: true,
      }),
    ]);
    return {
      last30Days: {
        invocations: total._count,
        inputTokens: total._sum.inputTokens ?? 0,
        outputTokens: total._sum.outputTokens ?? 0,
        costUsd: Number(total._sum.costUsd ?? 0),
      },
      byCapability: byCap.map((b) => ({
        capability: b.capability,
        invocations: b._count,
        costUsd: Number(b._sum.costUsd ?? 0),
      })),
    };
  }
}
