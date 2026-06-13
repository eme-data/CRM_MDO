import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

// Module RGPD : reponses aux droits d'acces et d'effacement (articles 15 et
// 17 du RGPD). Le scope ici se limite aux Contacts, donnees personnelles les
// plus directement concernees. Les Companies et Users sont des donnees
// professionnelles et ne sont pas couvertes par ce module.
//
// Strategie d'effacement : ANONYMISATION (pas de DELETE physique). Raison :
//   - Les contacts peuvent etre lies a des contrats / interventions / tickets
//     historiques dont les agregats facturation doivent rester coherents.
//   - On garde l'enregistrement avec des champs anonymises ("[supprime]"),
//     ce qui satisfait l'article 17 (effacement des donnees a caractere
//     personnel) sans casser l'integrite metier.
//
// La cascade (voir anonymizeContact) propage l'anonymisation aux entites
// liees qui peuvent contenir des PII du contact :
//   - Activity.metadata (peut contenir email/nom dans les payloads)
//   - TicketMessage.authorName/authorEmail (cas des messages entrants par email)
//   - ClientPortalUser + sessions + magic links (compte portail du contact)
//   - Note.* (deletion outright : trop risque de scanner du texte libre)
@Injectable()
export class GdprService {
  private readonly logger = new Logger(GdprService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Article 15 : droit d'acces. Retourne tout ce que le CRM stocke sur ce
  // contact (donnees brutes + relations directes : tickets, taches, notes,
  // activites le concernant). Format JSON destine a etre transmis au sujet
  // de donnees.
  async exportContact(contactId: string, tenantId: string | null) {
    // Scope tenant : un contact d'un autre tenant ne doit jamais etre exportable.
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, ...(tenantId ? { tenantId } : {}) },
      include: {
        company: { select: { id: true, name: true, siren: true } },
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!contact) throw new NotFoundException('Contact introuvable');

    const [tasks, tickets, notes, activities, portalAccount] = await Promise.all([
      this.prisma.task.findMany({
        where: { contactId },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          createdAt: true,
        },
      }),
      this.prisma.ticket.findMany({
        where: { contactId },
        select: {
          id: true,
          reference: true,
          title: true,
          status: true,
          priority: true,
          createdAt: true,
          closedAt: true,
        },
      }),
      this.prisma.note.findMany({
        where: { contactId },
        select: { id: true, content: true, createdAt: true },
      }),
      this.prisma.activity.findMany({
        where: { entity: 'Contact', entityId: contactId },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.clientPortalUser.findFirst({
        where: { contactId },
        select: { id: true, email: true, lastLoginAt: true, createdAt: true, isActive: true },
      }),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      contact,
      relatedTasks: tasks,
      relatedTickets: tickets,
      relatedNotes: notes,
      activityLog: activities,
      portalAccount,
      _meta: {
        version: '1.1',
        notice:
          'Export RGPD article 15. Les donnees liees aux contrats / facturation ne sont pas incluses (responsable de traitement distinct).',
      },
    };
  }

  // Article 17 : droit a l'effacement par ANONYMISATION en cascade.
  async anonymizeContact(contactId: string, performedBy: string, tenantId: string | null) {
    // Scope tenant : empeche l'anonymisation (destructive) d'un contact d'un autre tenant.
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, ...(tenantId ? { tenantId } : {}) },
    });
    if (!contact) throw new NotFoundException('Contact introuvable');
    if (contact.email?.startsWith('anonymized+')) {
      return { alreadyAnonymized: true, contactId };
    }

    // Sauvegardes AVANT mise a jour : on en a besoin pour cascader sur les
    // entites qui referencent l'email original (TicketMessage entrants).
    const originalEmail = contact.email?.toLowerCase().trim() ?? null;
    const tag = `anonymized+${contactId.slice(0, 8)}@deleted.local`;

    // Lookup des comptes portail rattaches : on a besoin de leurs ids pour
    // revoker sessions/magic-links (updateMany ne supporte pas les filtres de
    // relation imbriquee de maniere portable).
    const portalUsers = await this.prisma.clientPortalUser.findMany({
      where: { contactId },
      select: { id: true },
    });
    const portalUserIds = portalUsers.map((u) => u.id);

    // Construction de la transaction. Les operations conditionnelles (selon
    // l'existence d'un email original ou d'un compte portail) sont ajoutees
    // dynamiquement pour eviter les writes a vide.
    const ops: Prisma.PrismaPromise<unknown>[] = [
      // 1. Anonymisation du contact lui-meme (donnees nominatives + comm)
      this.prisma.contact.update({
        where: { id: contactId },
        data: {
          firstName: '[supprime]',
          lastName: '[supprime]',
          email: tag,
          phone: null,
          mobile: null,
          position: null,
          notes: null,
          isPrimary: false,
        },
      }),
      // 2. Notes libres : DELETE (trop risque de scanner du texte libre)
      this.prisma.note.deleteMany({ where: { contactId } }),
      // 3. Activity.metadata : peut contenir des PII (payloads de creation/
      // modification ayant capture email, telephone, etc.). On efface le
      // contenu en conservant la ligne pour l'audit trail.
      this.prisma.activity.updateMany({
        where: {
          entity: 'Contact',
          entityId: contactId,
          action: { not: 'GDPR_ANONYMIZE' },
        },
        data: { metadata: Prisma.DbNull },
      }),
    ];

    // 4. TicketMessage : si le contact a deja envoye des emails entrants, son
    // email apparait en clair dans authorEmail/authorName/cc/bcc. On nettoie.
    if (originalEmail) {
      ops.push(
        this.prisma.ticketMessage.updateMany({
          where: { authorEmail: { equals: originalEmail, mode: 'insensitive' } },
          data: {
            authorName: '[supprime]',
            authorEmail: tag,
            cc: null,
            bcc: null,
          },
        }),
      );
    }

    // 5. Compte portail : desactivation + anonymisation + revocation de toutes
    // les sessions actives + expiration des magic links non utilises.
    if (portalUserIds.length > 0) {
      const now = new Date();
      ops.push(
        this.prisma.clientPortalUser.updateMany({
          where: { id: { in: portalUserIds } },
          data: {
            isActive: false,
            // Note : on prefixe pour preserver l'unicite de l'email entre
            // plusieurs anonymisations du meme contact (rare mais possible
            // si plusieurs comptes portail lies historiquement).
            email: `portal+${tag}`,
            firstName: '[supprime]',
            lastName: '[supprime]',
          },
        }),
        this.prisma.clientPortalSession.updateMany({
          where: { userId: { in: portalUserIds }, revokedAt: null },
          data: { revokedAt: now },
        }),
        this.prisma.clientPortalMagicLink.updateMany({
          where: { userId: { in: portalUserIds }, usedAt: null, expiresAt: { gt: now } },
          data: { expiresAt: now },
        }),
      );
    }

    // 6. Trace de l'anonymisation (cette Activity ne sera PAS purgee : c'est
    // notre audit RGPD legal).
    ops.push(
      this.prisma.activity.create({
        data: {
          userId: performedBy,
          // Audit RGPD trace dans le tenant du contact (jamais purgee).
          tenantId: contact.tenantId,
          action: 'GDPR_ANONYMIZE',
          entity: 'Contact',
          entityId: contactId,
          metadata: {
            reason: 'right_to_erasure_art17',
            cascade: {
              portalAccountsAnonymized: portalUserIds.length,
              ticketMessagesScanned: Boolean(originalEmail),
            },
          },
        },
      }),
    );

    await this.prisma.$transaction(ops);

    this.logger.warn(
      `Contact ${contactId} anonymise par user ${performedBy} (RGPD art.17) — ` +
      `portalAccounts=${portalUserIds.length}, ticketMessagesScanned=${Boolean(originalEmail)}`,
    );
    return {
      anonymized: true,
      contactId,
      cascade: {
        portalAccountsAnonymized: portalUserIds.length,
        ticketMessagesScanned: Boolean(originalEmail),
      },
    };
  }
}
