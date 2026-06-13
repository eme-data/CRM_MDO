import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai.service';
import { AnthropicMessage, AnthropicTool, AnthropicContentBlock } from '../anthropic.client';

// Assistant conversationnel : un agent tool-use qui repond aux questions du
// gestionnaire sur les donnees de SON tenant. Les outils sont en LECTURE SEULE
// et tous scopes par tenantId (aucune fuite cross-tenant possible). Boucle
// agentique bornee a MAX_TURNS pour eviter tout emballement (cout/latence).

const MAX_TURNS = 5;
const n = (d: any) => (d == null ? 0 : Number(d));

const SYSTEM_PROMPT = `Tu es l'assistant du CRM d'un prestataire IT / infogerance. Tu reponds aux
questions du gestionnaire sur SES donnees (societes, tickets, contrats, revenus)
en utilisant les outils fournis.

Regles :
- Utilise les outils pour recuperer les donnees reelles ; n'invente jamais de chiffres.
- Reponds en francais, de facon concise et factuelle, avec les chiffres precis.
- Si l'information demandee n'est pas accessible via les outils disponibles, dis-le
  clairement plutot que de speculer.
- Tu peux enchainer plusieurs outils si necessaire avant de repondre.`;

const TOOLS: AnthropicTool[] = [
  {
    name: 'search_companies',
    description: 'Recherche des societes (clients/prospects) par nom. Retourne nom, secteur, statut, ville.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'terme de recherche' } }, required: ['query'] },
  },
  {
    name: 'count_tickets',
    description: 'Compte les tickets de support, optionnellement filtres par statut (OPEN, IN_PROGRESS, RESOLVED, CLOSED). Sans statut, renvoie la repartition complete.',
    input_schema: { type: 'object', properties: { status: { type: 'string' } } },
  },
  {
    name: 'list_open_tickets',
    description: 'Liste les tickets ouverts ou en cours, les plus recents (reference, titre, priorite, societe).',
    input_schema: { type: 'object', properties: { limit: { type: 'number', description: 'max 20' } } },
  },
  {
    name: 'expiring_contracts',
    description: 'Liste les contrats actifs dont la date de fin tombe dans les N prochains jours.',
    input_schema: { type: 'object', properties: { days: { type: 'number', description: 'horizon en jours (defaut 60)' } } },
  },
  {
    name: 'revenue_summary',
    description: 'Synthese des revenus : MRR, ARR, nombre de clients actifs, valeur du pipeline commercial.',
    input_schema: { type: 'object', properties: {} },
  },
];

@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async ask(question: string, tenantId: string | null, userId: string) {
    const q = (question ?? '').trim();
    if (q.length < 2) return { answer: 'Pose une question sur tes donnees (clients, tickets, contrats, revenus).', turns: 0 };

    const messages: AnthropicMessage[] = [{ role: 'user', content: q }];
    let finalText = '';
    let turns = 0;

    while (turns < MAX_TURNS) {
      turns++;
      const res = await this.ai.callModel({
        tenantId,
        capability: 'GENERIC',
        systemPrompt: SYSTEM_PROMPT,
        messages,
        tools: TOOLS,
        modelOverride: 'claude-opus-4-8',
        maxTokens: 1500,
        userId,
        entityType: 'Assistant',
      });
      // Rejoue la reponse assistant (texte + tool_use) dans l'historique.
      messages.push({ role: 'assistant', content: res.content as AnthropicContentBlock[] });

      if (res.stopReason !== 'tool_use' || res.toolUses.length === 0) {
        finalText = res.text;
        break;
      }

      // Execute chaque outil demande et renvoie les resultats.
      const toolResults: AnthropicContentBlock[] = [];
      for (const tu of res.toolUses) {
        let out: string;
        try {
          out = await this.execTool(tu.name, tu.input ?? {}, tenantId);
        } catch (e: any) {
          out = 'Erreur lors de l\'execution de l\'outil : ' + (e?.message ?? 'inconnue');
        }
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    return { answer: finalText || 'Je n\'ai pas pu formuler de reponse.', turns };
  }

  // Tous les outils sont READ-ONLY et scopes par tenantId.
  private async execTool(name: string, input: any, tenantId: string | null): Promise<string> {
    const t = tenantId ? { tenantId } : {};
    switch (name) {
      case 'search_companies': {
        const rows = await this.prisma.company.findMany({
          where: { ...t, name: { contains: String(input.query ?? ''), mode: 'insensitive' } },
          select: { name: true, sector: true, status: true, city: true },
          take: 15,
        });
        return JSON.stringify({ count: rows.length, companies: rows });
      }
      case 'count_tickets': {
        if (input.status) {
          const c = await this.prisma.ticket.count({ where: { ...t, status: input.status as any } });
          return JSON.stringify({ status: input.status, count: c });
        }
        const grouped = await this.prisma.ticket.groupBy({ by: ['status'], where: t, _count: true });
        return JSON.stringify({ byStatus: grouped.map((g) => ({ status: g.status, count: g._count })) });
      }
      case 'list_open_tickets': {
        const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 20);
        const rows = await this.prisma.ticket.findMany({
          where: { ...t, status: { in: ['OPEN', 'IN_PROGRESS'] as any } },
          select: { reference: true, title: true, priority: true, company: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
        return JSON.stringify({ count: rows.length, tickets: rows.map((r) => ({ ref: r.reference, title: r.title, priority: r.priority, company: r.company?.name })) });
      }
      case 'expiring_contracts': {
        const days = Math.min(Math.max(Number(input.days) || 60, 1), 365);
        const limit = new Date(Date.now() + days * 86400_000);
        const rows = await this.prisma.contract.findMany({
          where: { ...t, status: { in: ['ACTIVE', 'RENEWED'] as any }, endDate: { lte: limit } },
          select: { reference: true, offer: true, monthlyAmountHt: true, endDate: true, company: { select: { name: true } } },
          orderBy: { endDate: 'asc' },
          take: 30,
        });
        return JSON.stringify({
          horizonDays: days,
          count: rows.length,
          contracts: rows.map((r) => ({ ref: r.reference, company: r.company?.name, offer: r.offer, mrr: n(r.monthlyAmountHt), endDate: r.endDate.toISOString().slice(0, 10) })),
        });
      }
      case 'revenue_summary': {
        const [active, customers, pipeline] = await Promise.all([
          this.prisma.contract.findMany({ where: { ...t, status: { in: ['ACTIVE', 'RENEWED'] as any } }, select: { monthlyAmountHt: true } }),
          this.prisma.company.count({ where: { ...t, status: 'CUSTOMER' as any } }),
          this.prisma.opportunity.findMany({ where: { ...t, stage: { in: ['QUALIFICATION', 'PROPOSITION', 'NEGOCIATION'] as any } }, select: { amountHt: true, probability: true } }),
        ]);
        const mrr = active.reduce((s, c) => s + n(c.monthlyAmountHt), 0);
        const weightedPipeline = pipeline.reduce((s, o) => s + n(o.amountHt) * (n(o.probability) / 100), 0);
        return JSON.stringify({
          mrrHt: +mrr.toFixed(2),
          arrHt: +(mrr * 12).toFixed(2),
          activeCustomers: customers,
          pipelineWeightedHt: +weightedPipeline.toFixed(2),
        });
      }
      default:
        return 'Outil inconnu : ' + name;
    }
  }
}
