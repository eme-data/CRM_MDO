import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
- Si on te fournit un EXTRAIT KB ou un TICKET PRECEDENT pertinent, utilise-le
  comme source mais REFORMULE pour ce contexte — ne copie jamais textuellement.
- Si rien dans la KB / les tickets precedents ne s'applique vraiment, ignore-les
  plutot que de forcer un parallele faux.

Reponds uniquement avec le corps de l'email, sans en-tete ni metadata.`;

// Mots vides FR a exclure de la recherche pour eviter de matcher 90% du corpus
// sur "le", "de", "et"... Liste minimale ciblee tickets support.
const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'au', 'aux',
  'et', 'ou', 'mais', 'donc', 'car', 'ni',
  'a', 'pour', 'par', 'avec', 'sans', 'sur', 'sous', 'dans', 'chez',
  'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
  'me', 'te', 'se', 'mon', 'ton', 'son', 'ma', 'ta', 'sa', 'mes', 'tes', 'ses',
  'ce', 'cet', 'cette', 'ces', 'qui', 'que', 'quoi', 'dont',
  'est', 'sont', 'ai', 'as', 'a', 'avons', 'avez', 'ont',
  'pas', 'plus', 'moins', 'tres', 'bien', 'mal',
  'merci', 'bonjour', 'cordialement', 'support',
]);

// Extrait les 3-5 mots-cles les plus discriminants du texte (mots > 4 char,
// hors stopwords). Sert a chercher KB/tickets similaires.
function extractKeywords(text: string, max = 5): string[] {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  // Frequence + ordre d'apparition pour favoriser les termes qui reviennent
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

@Injectable()
export class TicketDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  // Recherche KB : matche par mots-cles dans titre/contenu/tags. On limite a 3
  // articles publies pertinents pour ne pas exploser le contexte (et le cout).
  private async findRelevantKb(keywords: string[], companyId: string) {
    if (keywords.length === 0) return [];
    const where: Prisma.KbArticleWhereInput = {
      isPublished: true,
      OR: [
        // Articles GLOBAL/INTERNAL (visibles tous techniciens)
        { scope: { in: ['GLOBAL', 'INTERNAL'] } },
        // + articles CLIENT specifiques a ce client
        { scope: 'CLIENT', companyId },
      ],
      AND: {
        OR: keywords.flatMap((k) => [
          { title: { contains: k, mode: 'insensitive' as const } },
          { excerpt: { contains: k, mode: 'insensitive' as const } },
          { tags: { has: k } },
        ]),
      },
    };
    return this.prisma.kbArticle.findMany({
      where,
      select: { id: true, title: true, excerpt: true, content: true, slug: true },
      take: 3,
      orderBy: [{ helpfulCount: 'desc' }, { viewCount: 'desc' }],
    });
  }

  // Recherche tickets resolus du meme client matchant les mots-cles. Limite a 3
  // pour controler le cout. Exclut le ticket courant.
  private async findSimilarResolvedTickets(
    keywords: string[],
    companyId: string,
    currentTicketId: string,
  ) {
    if (keywords.length === 0) return [];
    return this.prisma.ticket.findMany({
      where: {
        id: { not: currentTicketId },
        companyId,
        status: { in: ['RESOLVED', 'CLOSED'] },
        OR: keywords.flatMap((k) => [
          { title: { contains: k, mode: 'insensitive' as const } },
          { description: { contains: k, mode: 'insensitive' as const } },
        ]),
      },
      select: {
        id: true,
        reference: true,
        title: true,
        // Dernier message non-interne du staff = la "resolution" en pratique
        messages: {
          where: { isInternal: false, authorId: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true },
        },
      },
      orderBy: { resolvedAt: 'desc' },
      take: 3,
    });
  }

  // Scope tenant : sans, un user du tenant A pouvait declencher Claude
  // pour drafter une reponse a un ticket du tenant B en devinant l'UUID —
  // Claude renvoyait alors une analyse contenant le contenu du ticket.
  // Filtre tenantId obligatoire.
  async draftReply(ticketId: string, tenantId: string | null, userId: string) {
    const t = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId },
      include: {
        company: { select: { id: true, name: true, sector: true } },
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

    // Contexte enrichi : extrait les mots-cles du ticket pour chercher la KB et
    // les tickets similaires deja resolus chez ce client. Best-effort : si la
    // recherche echoue ou ne trouve rien, on continue sans (le draft basique
    // reste utile).
    const keywords = extractKeywords(t.title + ' ' + (t.description ?? ''));
    const [kbHits, similarTickets] = await Promise.all([
      this.findRelevantKb(keywords, t.company.id).catch(() => []),
      this.findSimilarResolvedTickets(keywords, t.company.id, ticketId).catch(() => []),
    ]);

    const kbBlock = kbHits.length > 0
      ? '\n\nEXTRAITS KB pertinents (a utiliser comme source, REFORMULE) :\n' +
        kbHits.map((k, i) =>
          '[KB' + (i + 1) + '] ' + k.title + '\n' +
          (k.excerpt ?? k.content.slice(0, 500))
        ).join('\n\n')
      : '';

    const similarBlock = similarTickets.length > 0
      ? '\n\nTICKETS PRECEDENTS RESOLUS chez ce client (resolutions a adapter) :\n' +
        similarTickets.map((s, i) =>
          '[' + s.reference + '] ' + s.title + '\n' +
          'Resolution : ' + (s.messages[0]?.content?.slice(0, 600) ?? '(non documentee)')
        ).join('\n\n')
      : '';

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
      kbBlock,
      similarBlock,
      '',
      "Redige un brouillon de reponse pour la prochaine intervention de l'equipe MDO.",
    ].join('\n');

    const text = await this.ai.invoke({
      capability: 'TICKET_DRAFT',
      tenantId,
      systemPrompt: DRAFT_SYSTEM_PROMPT,
      userMessage,
      maxTokens: 800,
      temperature: 0.4,
      entityType: 'Ticket',
      entityId: ticketId,
      userId,
    });

    return {
      draft: text.trim(),
      // Sources utilisees : tracabilite UI ("le draft s'est appuye sur X et Y").
      sources: {
        kb: kbHits.map((k) => ({ id: k.id, title: k.title, slug: k.slug })),
        similarTickets: similarTickets.map((s) => ({ id: s.id, reference: s.reference, title: s.title })),
        keywords,
      },
    };
  }
}
