// Client minimaliste Anthropic Messages API. Pas de SDK pour eviter une
// dependance lourde sur un module qui evolue souvent — l'API est stable et
// triviale a appeler en HTTP.
//
// Reference : https://docs.anthropic.com/en/api/messages
//
// Prompt caching : on marque le system prompt avec cache_control: { type: 'ephemeral' }
// pour beneficier de la reduction de cout sur les invocations repetees (TTL 5 min).

import { Logger } from '@nestjs/common';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Beta header pour le support des PDF en source. Stable depuis fin 2024,
// mais marque "beta" — on l'envoie systematiquement, sans effet sur les
// requetes texte/images.
const ANTHROPIC_BETA_PDF = 'pdfs-2024-09-25';

// Bloc de contenu typé. Permet d'envoyer image / PDF / texte dans le meme
// message (Claude Vision + document). Compatibilité avec l'ancien format
// "string" preservée (cf normalisation avant envoi).
export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string };
    }
  | {
      type: 'document';
      source: { type: 'base64'; media_type: 'application/pdf'; data: string };
    };

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export interface AnthropicCallParams {
  apiKey: string;
  model: string;
  systemPrompt?: string;       // sera cache si fourni
  messages: AnthropicMessage[];
  maxTokens?: number;
  temperature?: number;
  // Si true, on encapsule le system prompt avec cache_control ephemeral (TTL 5 min)
  // pour beneficier de la reduction de cout (10x moins cher en lecture).
  cacheSystem?: boolean;
}

export interface AnthropicResponse {
  text: string;
  stopReason: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
}

const logger = new Logger('AnthropicClient');

export async function callAnthropic(params: AnthropicCallParams): Promise<AnthropicResponse> {
  const body: any = {
    model: params.model,
    max_tokens: params.maxTokens ?? 1024,
    messages: params.messages,
  };
  if (typeof params.temperature === 'number') body.temperature = params.temperature;
  if (params.systemPrompt) {
    if (params.cacheSystem) {
      // Forme structuree pour pouvoir attacher cache_control
      body.system = [
        {
          type: 'text',
          text: params.systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ];
    } else {
      body.system = params.systemPrompt;
    }
  }

  // On detecte si un message contient un PDF pour activer le header beta.
  // Pas de surcoût a l'ajouter systematiquement, mais on reste explicite.
  const hasPdf = params.messages.some(
    (m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'document'),
  );
  const headers: Record<string, string> = {
    'x-api-key': params.apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'content-type': 'application/json',
  };
  if (hasPdf) headers['anthropic-beta'] = ANTHROPIC_BETA_PDF;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    // Vision + PDF peuvent prendre plusieurs secondes pour les gros fichiers.
    // 90s couvre largement le pire cas.
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const txt = await res.text();
    logger.warn('Anthropic HTTP ' + res.status + ' : ' + txt.slice(0, 500));
    throw new Error('Anthropic API ' + res.status + ' : ' + txt.slice(0, 200));
  }
  const json: any = await res.json();
  // json.content est un tableau de blocks, on concatene les text blocks
  const text: string = (json.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n');
  const usage = json.usage ?? {};
  return {
    text,
    stopReason: json.stop_reason ?? null,
    usage: {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
    },
  };
}

// Tarifs USD / 1M tokens (2026 — Claude 4.X)
// A maintenir si Anthropic publie de nouveaux tarifs.
const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-4-7':         { input: 15,  output: 75,  cacheRead: 1.5, cacheWrite: 18.75 },
  'claude-sonnet-4-6':       { input: 3,   output: 15,  cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5,   cacheRead: 0.1, cacheWrite: 1.25 },
};

export function estimateCostUsd(model: string, usage: AnthropicResponse['usage']): number {
  const p = PRICING[model] ?? PRICING['claude-sonnet-4-6'];
  return (
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheReadTokens * p.cacheRead +
      usage.cacheCreationTokens * p.cacheWrite) /
    1_000_000
  );
}
