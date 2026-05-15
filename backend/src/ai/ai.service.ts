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
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async isEnabled(): Promise<boolean> {
    return this.settings.getBool('ai.enabled');
  }

  // ============================================================
  // Resolution clef + modele + contexte company
  // ============================================================
  private async loadConfig() {
    const enabled = await this.settings.getBool('ai.enabled');
    if (!enabled) {
      throw new ServiceUnavailableException('IA desactivee (Settings > IA > Activer)');
    }
    const apiKey = await this.settings.get('ai.apiKey');
    if (!apiKey) {
      throw new BadRequestException('Cle API Anthropic non configuree');
    }
    const model = (await this.settings.get('ai.model')) ?? 'claude-sonnet-4-6';
    const companyContext = (await this.settings.get('ai.companyContext')) ?? '';
    return { apiKey, model, companyContext };
  }

  // ============================================================
  // Wrapper bas-niveau : appelle l'API + log AiUsage
  // Le system prompt final = "<companyContext>\n\n<systemPrompt>".
  // ============================================================
  async invoke(params: InvokeParams): Promise<string> {
    const { apiKey, model, companyContext } = await this.loadConfig();
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
  // Stats consommation (admin)
  // ============================================================
  async usageStats() {
    const since = new Date(Date.now() - 30 * 86400_000);
    const [total, byCap] = await Promise.all([
      this.prisma.aiUsage.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { inputTokens: true, outputTokens: true, costUsd: true },
        _count: true,
      }),
      this.prisma.aiUsage.groupBy({
        by: ['capability'],
        where: { createdAt: { gte: since } },
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
