import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TicketCategory, TicketPriority } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TicketsService } from '../tickets/tickets.service';

// Service qui sert les donnees au portail client. TOUJOURS scope au companyId
// du PortalUser pour empecher tout acces cross-tenant.

@Injectable()
export class PortalDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
  ) {}

  // ============================================================
  // CONTRATS
  // ============================================================
  async listContracts(companyId: string) {
    return this.prisma.contract.findMany({
      where: { companyId },
      orderBy: { startDate: 'desc' },
      select: {
        id: true,
        reference: true,
        title: true,
        offer: true,
        status: true,
        startDate: true,
        endDate: true,
        quantity: true,
        monthlyAmountHt: true,
      },
    });
  }

  // ============================================================
  // TICKETS
  // ============================================================
  async listTickets(companyId: string, params: { status?: string } = {}) {
    return this.prisma.ticket.findMany({
      where: {
        companyId,
        ...(params.status ? { status: params.status as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        priority: true,
        category: true,
        createdAt: true,
        resolvedAt: true,
        dueDate: true,
        assignee: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async getTicket(companyId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { firstName: true, lastName: true } } },
        },
        assignee: { select: { firstName: true, lastName: true } },
        attachments: {
          select: { id: true, filename: true, sizeBytes: true, createdAt: true },
        },
      },
    });
    if (!ticket) throw new NotFoundException();
    // Securite : tenant isolation
    if (ticket.companyId !== companyId) throw new NotFoundException();
    return ticket;
  }

  async createTicket(
    companyId: string,
    portalUser: { id: string; email: string; firstName: string | null; lastName: string | null; contactId?: string | null },
    body: { title: string; description: string; priority?: TicketPriority; category?: TicketCategory },
  ) {
    if (!body.title || body.title.trim().length < 3) {
      throw new BadRequestException('Titre requis (3 caracteres min).');
    }
    if (!body.description || body.description.trim().length < 5) {
      throw new BadRequestException('Description requise (5 caracteres min).');
    }

    // On retrouve un user CRM "systeme" pour creer le ticket (createdById obligatoire
    // en BDD). On choisit le 1er ADMIN actif comme fallback. Plus tard, on pourrait
    // creer un user systeme dedie ("Portail client") si on veut filtrer.
    const adminUser = await this.prisma.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!adminUser) {
      throw new BadRequestException('Aucun administrateur actif configure dans le CRM.');
    }

    // Resolution du Contact CRM associe au portail user
    let contactId: string | undefined = portalUser.contactId ?? undefined;
    if (!contactId) {
      const existing = await this.prisma.contact.findFirst({
        where: { companyId, email: { equals: portalUser.email, mode: 'insensitive' } },
        select: { id: true },
      });
      contactId = existing?.id;
    }

    // Marquage : le titre est prefixe pour qu'on identifie les tickets portail
    // dans la file d'attente CRM. Optionnel mais utile pour la priorisation.
    const title = body.title.trim();
    const description = body.description.trim();

    return this.tickets.create(
      {
        title,
        description,
        companyId,
        contactId,
        priority: body.priority ?? TicketPriority.NORMAL,
        category: body.category ?? TicketCategory.REQUEST,
        channel: 'PORTAL' as any,
      } as any,
      adminUser.id,
    );
  }

  async replyToTicket(
    companyId: string,
    portalUser: { id: string; email: string; firstName: string | null; lastName: string | null },
    ticketId: string,
    body: { content: string },
  ) {
    // Verifie tenant isolation
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, companyId: true, status: true },
    });
    if (!ticket || ticket.companyId !== companyId) throw new NotFoundException();
    if (!body.content || body.content.trim().length < 1) {
      throw new BadRequestException('Message vide.');
    }

    // Resolution user CRM (admin par defaut, requis pour le champ authorId nullable)
    // On laisse authorId=null pour marquer "message client" et on stocke l'identifiant
    // dans le contenu meta.
    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        content: body.content.trim(),
        authorId: null,
        // Auteur identifie par le contact portail (name/email gardes pour traçabilite
        // meme si l'auteur User est null cote interne).
        authorName: portalUser.firstName && portalUser.lastName
          ? `${portalUser.firstName} ${portalUser.lastName}`
          : portalUser.email,
        authorEmail: portalUser.email,
        isInternal: false,
      },
    });

    // Si le ticket etait en attente client, on le repasse en cours
    if (ticket.status === 'WAITING_CUSTOMER') {
      await this.prisma.ticket.update({
        where: { id: ticketId },
        data: { status: 'IN_PROGRESS' as any },
      });
    }

    return message;
  }

  // ============================================================
  // ASSETS SURVEILLES (seulement ceux pertinents pour le client)
  // ============================================================
  async listAssets(companyId: string) {
    return this.prisma.asset.findMany({
      where: {
        companyId,
        status: { in: ['ACTIVE', 'EXPIRED'] },
      },
      orderBy: [{ status: 'asc' }, { expiresAt: 'asc' }],
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        identifier: true,
        expiresAt: true,
        monitoringEnabled: true,
        lastMonitoredAt: true,
        // Ne PAS exposer notes, costHt, etc. (donnees internes MDO)
      },
    });
  }
}
