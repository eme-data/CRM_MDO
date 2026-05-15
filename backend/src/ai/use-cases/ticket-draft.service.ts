import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai.service';

const DRAFT_SYSTEM_PROMPT = `Tu rediges un BROUILLON de reponse a un ticket support pour un technicien
MDO Services. Le brouillon sera relu et edite par le technicien avant envoi —
ton role est de gagner du temps, pas de remplacer son expertise.

Regles :
- Ecris EN FRANCAIS, ton cordial-pro, vouvoiement.
- Commence par "Bonjour {prenomContact}," (ou "Bonjour," si pas de prenom).
- Si la question manque d'info pour repondre, demande explicitement les
  precisions necessaires (capture, message d'erreur exact, plage horaire, etc).
- Si tu proposes une procedure, numerote les etapes.
- Ne signe PAS l'email (la signature est ajoutee automatiquement).
- N'invente jamais de delai, de tarif, ou de promesse SLA precise.
- Si la demande necessite une intervention sur site / un devis / une autorisation,
  dis-le explicitement et indique la prochaine etape.

Reponds uniquement avec le corps de l'email, sans en-tete ni metadata.`;

@Injectable()
export class TicketDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async draftReply(ticketId: string, userId: string) {
    const t = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        company: { select: { name: true, sector: true } },
        contact: { select: { firstName: true, lastName: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 10,
          select: { content: true, authorId: true, viaEmail: true, createdAt: true, isInternal: true },
        },
      },
    });
    if (!t) throw new NotFoundException('Ticket introuvable');

    const conversation = t.messages
      .filter((m) => !m.isInternal)
      .map((m, i) => {
        // Pas d'authorId = message externe (client via mail entrant ou portail)
        const who = m.authorId ? 'MDO' : 'CLIENT';
        return '[' + (i + 1) + '] ' + who + ' :\n' + m.content;
      })
      .join('\n\n');

    const userMessage = [
      'Societe : ' + t.company.name + ' (secteur ' + t.company.sector + ')',
      t.contact ? 'Contact : ' + t.contact.firstName + ' ' + t.contact.lastName : 'Contact : -',
      'Sujet du ticket : ' + t.title,
      'Categorie : ' + t.category + ' / Priorite : ' + t.priority,
      '',
      'Description initiale :',
      (t.description ?? '').slice(0, 2000),
      '',
      'Echanges :',
      conversation || '(aucun message)',
      '',
      "Redige un brouillon de reponse pour la prochaine intervention de l'equipe MDO.",
    ].join('\n');

    const text = await this.ai.invoke({
      capability: 'TICKET_DRAFT',
      systemPrompt: DRAFT_SYSTEM_PROMPT,
      userMessage,
      maxTokens: 800,
      temperature: 0.4,
      entityType: 'Ticket',
      entityId: ticketId,
      userId,
    });

    return { draft: text.trim() };
  }
}
