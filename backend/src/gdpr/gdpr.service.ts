import { Injectable, NotFoundException, Logger } from '@nestjs/common';
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
@Injectable()
export class GdprService {
  private readonly logger = new Logger(GdprService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Article 15 : droit d'acces. Retourne tout ce que le CRM stocke sur ce
  // contact (donnees brutes + relations directes : tickets, taches, notes,
  // activites le concernant). Format JSON destine a etre transmis au sujet
  // de donnees.
  async exportContact(contactId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        company: { select: { id: true, name: true, siren: true } },
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!contact) throw new NotFoundException('Contact introuvable');

    const [tasks, tickets, notes, activities] = await Promise.all([
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
    ]);

    return {
      exportedAt: new Date().toISOString(),
      contact,
      relatedTasks: tasks,
      relatedTickets: tickets,
      relatedNotes: notes,
      activityLog: activities,
      _meta: {
        version: '1.0',
        notice:
          'Export RGPD article 15. Les donnees liees aux contrats / facturation ne sont pas incluses (responsable de traitement distinct).',
      },
    };
  }

  // Article 17 : droit a l'effacement (anonymisation, voir doc en tete).
  async anonymizeContact(contactId: string, performedBy: string) {
    const contact = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) throw new NotFoundException('Contact introuvable');
    if (contact.email?.startsWith('anonymized+')) {
      return { alreadyAnonymized: true, contactId };
    }

    const tag = `anonymized+${contactId.slice(0, 8)}@deleted.local`;
    await this.prisma.$transaction([
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
      // Purge des notes libres qui pourraient contenir des donnees personnelles
      this.prisma.note.deleteMany({ where: { contactId } }),
      this.prisma.activity.create({
        data: {
          userId: performedBy,
          action: 'GDPR_ANONYMIZE',
          entity: 'Contact',
          entityId: contactId,
          metadata: { reason: 'right_to_erasure_art17' },
        },
      }),
    ]);

    this.logger.warn(`Contact ${contactId} anonymise par user ${performedBy} (RGPD art.17)`);
    return { anonymized: true, contactId };
  }
}
