import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AiCapability } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { callAnthropic, estimateCostUsd, AnthropicContentBlock } from './anthropic.client';

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
    const { apiKey, model, companyContext } = await this.loadConfig(params.tenantId ?? null);
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
