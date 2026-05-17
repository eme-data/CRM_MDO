import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai.service';

const SUMMARY_SYSTEM_PROMPT = `Tu resumes un fil de conversation support pour un technicien MDO Services
qui s'apprete a repondre. Le but : qu'il puisse comprendre l'historique en
30 secondes au lieu de relire 15 emails.

Format STRICT (Markdown court, en francais) :

**Demande initiale**
1 phrase factuelle.

**Etapes deja faites**
- puce courte par action (cote MDO ET cote client)

**Statut actuel**
1-2 phrases : ce qu'on attend, qui doit faire le prochain move.

**Points d'attention**
- ce qui n'a pas ete repondu, contradiction client, deadline mentionnee, etc.
(omettre cette section si rien a signaler)

Regles :
- Strictement factuel, pas d'interpretation au-dela des messages.
- Pas de salutations, pas d'introduction, pas de conclusion.
- Si une info manque (ex: pas de capture promise), dis-le explicitement.
- Si le fil est court (1-2 messages), reponds juste "Fil court, voir la
  description du ticket." sans inventer.`;

@Injectable()
export class TicketSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  // Scope tenant : sans, un user du tenant A pouvait demander un resume IA
  // d'un ticket du tenant B en devinant l'UUID — Claude exposait tout le
  // contenu du ticket dans la reponse. Filtre par tenantId obligatoire.
  async summarizeThread(ticketId: string, tenantId: string | null, userId: string) {
    const t = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
      select: {
        id: true,
        title: true,
        description: true,
        company: { select: { name: true } },
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: 'asc' },
          select: { content: true, authorId: true, authorName: true, createdAt: true },
        },
      },
    });
    if (!t) throw new NotFoundException('Ticket introuvable');

    if (t.messages.length === 0) {
      return { summary: 'Aucun message echange — voir uniquement la description du ticket.' };
    }

    const conversation = t.messages
      .map((m, i) => {
        const who = m.authorId ? 'MDO' : (m.authorName ?? 'CLIENT');
        const date = m.createdAt.toISOString().slice(0, 10);
        // Tronque chaque message a 2000 char pour controler le cout token sur
        // les fils super longs (~50 messages × 5KB).
        return '[' + (i + 1) + '] ' + date + ' — ' + who + ' :\n' + m.content.slice(0, 2000);
      })
      .join('\n\n');

    const userMessage = [
      'Client : ' + t.company.name,
      'Sujet : ' + t.title,
      '',
      'Description initiale :',
      (t.description ?? '').slice(0, 1500),
      '',
      'Conversation (' + t.messages.length + ' messages) :',
      conversation,
    ].join('\n');

    const text = await this.ai.invoke({
      capability: 'TICKET_SUMMARY',
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      userMessage,
      maxTokens: 600,
      temperature: 0.2,
      entityType: 'Ticket',
      entityId: ticketId,
      userId,
    });

    return { summary: text.trim(), messageCount: t.messages.length };
  }
}
