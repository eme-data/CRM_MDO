import { Injectable, NotFoundException } from '@nestjs/common';
import { TicketCategory, TicketPriority } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai.service';

const TRIAGE_SYSTEM_PROMPT = `Tu es l'assistant de triage des tickets support de MDO Services.
Pour chaque ticket entrant, tu dois renvoyer UNIQUEMENT un JSON valide
(sans bloc markdown, sans commentaire), suivant ce format strict :

{
  "category": "INCIDENT" | "REQUEST" | "QUESTION" | "BUG" | "OTHER",
  "priority": "LOW" | "NORMAL" | "HIGH" | "URGENT",
  "summary": "phrase de 1-2 lignes resumant le probleme en francais",
  "reasoning": "1 phrase justifiant la priorite (ce qui est en jeu pour le client)"
}

Regles de classification :
- INCIDENT : quelque chose ne marche plus / panne en production
- REQUEST : demande de prestation, nouvelle config, ajout utilisateur
- QUESTION : interrogation, demande de conseil
- BUG : dysfonctionnement repete d'un outil
- OTHER : commercial, administratif, hors scope

Regles de priorite :
- URGENT : production a l'arret / securite compromise / VIP
- HIGH : impact significatif, plusieurs utilisateurs touches
- NORMAL : utilisateur unique gene mais peut continuer a travailler
- LOW : amelioration, demande sans urgence

N'invente jamais de detail. Si l'information manque, choisis la categorie/priorite
la plus prudente plutot que d'extrapoler.`;

@Injectable()
export class TicketTriageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  // Scope tenant : un user du tenant A pouvait declencher un triage IA sur
  // un ticket du tenant B en devinant l'UUID — Claude analysait alors le
  // contenu du ticket et le renvoyait dans la reponse (exfiltration via IA).
  // Maintenant : findFirst({ id, tenantId }) — un mismatch leve NotFound.
  async triage(ticketId: string, tenantId: string | null, userId: string) {
    const t = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
      include: {
        company: { select: { name: true, sector: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 3,
          select: { content: true, authorId: true, viaEmail: true },
        },
      },
    });
    if (!t) throw new NotFoundException('Ticket introuvable');

    const initialMsg = t.messages[0]?.content ?? t.description ?? '';

    const userMessage = [
      'Societe : ' + t.company.name + ' (secteur ' + t.company.sector + ')',
      'Sujet : ' + t.title,
      'Premiere description :',
      initialMsg.slice(0, 2000),
    ].join('\n');

    const text = await this.ai.invoke({
      capability: 'TICKET_TRIAGE',
      tenantId,
      systemPrompt: TRIAGE_SYSTEM_PROMPT,
      userMessage,
      maxTokens: 400,
      temperature: 0,
      entityType: 'Ticket',
      entityId: ticketId,
      userId,
    });

    // Parse JSON tolerant : si Claude renvoie du markdown malgre l'instruction,
    // on extrait le 1er bloc {...}
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return { raw: text, error: 'Reponse non parsable' };
    }
    let parsed: any;
    try { parsed = JSON.parse(match[0]); }
    catch { return { raw: text, error: 'JSON invalide' }; }

    const category: TicketCategory = ['INCIDENT', 'REQUEST', 'QUESTION', 'BUG', 'OTHER'].includes(parsed.category)
      ? parsed.category
      : t.category;
    const priority: TicketPriority = ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(parsed.priority)
      ? parsed.priority
      : t.priority;

    return {
      suggested: {
        category,
        priority,
        summary: parsed.summary ?? '',
        reasoning: parsed.reasoning ?? '',
      },
      current: {
        category: t.category,
        priority: t.priority,
      },
    };
  }

  // Application des suggestions sur le ticket (action separee — l'utilisateur
  // valide d'abord la suggestion avant qu'elle soit appliquee).
  async applyTriage(
    ticketId: string,
    update: { category?: TicketCategory; priority?: TicketPriority },
    tenantId: string | null,
    userId: string,
  ) {
    const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, tenantId } });
    if (!ticket) throw new NotFoundException('Ticket introuvable');
    const u = await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        category: update.category,
        priority: update.priority,
      },
    });
    await this.prisma.activity.create({
      data: {
        userId,
        tenantId: ticket.tenantId,
        action: 'AI_TRIAGE_APPLIED',
        entity: 'Ticket',
        entityId: ticketId,
        metadata: { category: update.category, priority: update.priority },
      },
    });
    return u;
  }
}
