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

  // ============================================================
  // FACTURES (lecture seule, lien profond vers PDF Qonto)
  // ============================================================
  async listInvoices(companyId: string) {
    return this.prisma.invoice.findMany({
      where: {
        companyId,
        // Pas les brouillons : un client n'a pas a voir une facture pas encore emise.
        status: { in: ['ISSUED', 'PAID', 'OVERDUE', 'CANCELLED'] },
      },
      orderBy: { issueDate: 'desc' },
      take: 100,
      select: {
        id: true,
        number: true,
        status: true,
        issueDate: true,
        dueDate: true,
        paidAt: true,
        totalHt: true,
        totalTtc: true,
        externalUrl: true,    // lien Qonto (consultation)
        externalPdfUrl: true, // lien PDF direct (telechargement)
      },
    });
  }

  // ============================================================
  // UPTIME : monitors publics (isPublic=true) + ceux du client
  // ============================================================
  async listUptime(companyId: string) {
    return this.prisma.uptimeMonitor.findMany({
      where: {
        // Le client voit UNIQUEMENT ses monitors a lui (pas les autres clients
        // ni les monitors internes MDO sans companyId).
        companyId,
        enabled: true,
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        url: true,
        lastStatus: true,
        lastCheckedAt: true,
        lastResponseMs: true,
        intervalMinutes: true,
      },
    });
  }

  // ============================================================
  // CYBER SCORE : derniere note Microsoft Secure Score du tenant client
  // ============================================================
  async cyberScore(companyId: string) {
    const tenant = await this.prisma.m365Tenant.findFirst({
      where: { companyId },
      select: {
        id: true,
        secureScore: true,
        secureScoreMax: true,
        secureScorePercent: true,
        secureScoreSyncedAt: true,
      },
    });
    if (!tenant) return null;
    // Compteur alertes ouvertes : status != 'resolved' (cf M365SecurityAlert).
    // Side query : pas de relation _count parce que le where porte sur un
    // champ string, pas sur une date nullable.
    const openAlerts = await this.prisma.m365SecurityAlert.count({
      where: { m365TenantId: tenant.id, status: { notIn: ['resolved'] } },
    });
    return {
      score: tenant.secureScore,
      maxScore: tenant.secureScoreMax,
      percent: tenant.secureScorePercent,
      lastSyncAt: tenant.secureScoreSyncedAt,
      openAlerts,
    };
  }

  // ============================================================
  // BACKUPS : statut du dernier run pour chaque job de sauvegarde
  // ============================================================
  async listBackups(companyId: string) {
    return this.prisma.backupJob.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        vendor: true,
        sourceType: true,
        expectedFrequencyHours: true,
        lastRunStatus: true,
        lastRunAt: true,
        lastSuccessAt: true,
        // Pas d'exposition des credentials/secrets
      },
    });
  }

  // ============================================================
  // SOUS-TRAITANTS RGPD : registre public des sous-traitants utilises
  // par MDO pour traiter les donnees du client (article 28 RGPD).
  // ============================================================
  // Note : ce registre n'est pas scope par companyId — c'est la liste de
  // TOUS les sous-traitants MDO actifs (commune a tous nos clients).
  // Le client la consulte pour son audit RGPD/CNIL.
  async listSubprocessors() {
    return this.prisma.subprocessor.findMany({
      where: { isActive: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        legalEntity: true,
        role: true,
        purpose: true,
        dataCategories: true,
        hostingCountry: true,
        transfersOutsideEu: true,
        transferMechanism: true,
        dpaUrl: true,
        vendorSubprocessorListUrl: true,
        startedAt: true,
      },
    });
  }

  // ============================================================
  // DOCUMENTS GED visibles client (visibleToClient=true uniquement)
  // ============================================================
  async listDocuments(companyId: string) {
    return this.prisma.companyDocument.findMany({
      where: { companyId, visibleToClient: true },
      orderBy: [{ category: 'asc' }, { uploadedAt: 'desc' }],
      select: {
        id: true,
        filename: true,
        title: true,
        description: true,
        category: true,
        mimeType: true,
        sizeBytes: true,
        expiresAt: true,
        uploadedAt: true,
      },
    });
  }

  // Le portail telecharge le fichier physique. On verifie le scope companyId
  // ET visibleToClient pour empecher tout download d'un doc qui ne serait pas
  // marque visible (defense en profondeur).
  async getDocumentForDownload(companyId: string, documentId: string) {
    const d = await this.prisma.companyDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true, companyId: true, visibleToClient: true,
        storageKey: true, filename: true, mimeType: true, sizeBytes: true,
      },
    });
    if (!d) throw new NotFoundException();
    if (d.companyId !== companyId || !d.visibleToClient) {
      throw new NotFoundException();
    }
    return d;
  }
}
