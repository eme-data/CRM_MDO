import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { subDays } from 'date-fns';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';

const TOKEN_TTL_DAYS = 30;

@Injectable()
export class NpsService {
  private readonly logger = new Logger(NpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Envoie une demande NPS au contact du ticket. Si une demande existe deja
   * pour ce ticket, on la reutilise (idempotent) sauf si force=true.
   */
  async sendForTicket(
    ticketId: string,
    options: { force?: boolean; overrideTo?: string } = {},
    tenantId: string | null = null,
  ) {
    // Scope tenant : empeche un admin d'envoyer une demande NPS sur un ticket
    // d'un autre tenant. tenantId null = appel systeme (hook onTicketResolved).
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, ...(tenantId ? { tenantId } : {}) },
      include: {
        company: { select: { name: true, email: true } },
        contact: { select: { firstName: true, lastName: true, email: true } },
        satisfaction: true,
      },
    });
    if (!ticket) throw new NotFoundException('Ticket introuvable');

    const to = options.overrideTo
      ?? ticket.contact?.email
      ?? ticket.company.email
      ?? null;
    if (!to) {
      throw new BadRequestException(
        "Aucun email destinataire (ni contact, ni email societe). Renseignez le contact du ticket.",
      );
    }

    // Idempotence : on ne re-envoie pas si une demande existe deja et n'a pas
    // ete soumise (sauf force). Si soumise, on ne re-envoie jamais.
    if (ticket.satisfaction) {
      if (ticket.satisfaction.submittedAt) {
        throw new BadRequestException('Le client a deja repondu (note ' + ticket.satisfaction.score + ').');
      }
      if (!options.force) {
        return ticket.satisfaction;
      }
    }

    const token = randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 3600 * 1000);
    const now = new Date();

    const data = {
      ticketId,
      token,
      tokenExpiresAt,
      sentTo: to,
      sentAt: now,
    };
    const sat = ticket.satisfaction
      ? await this.prisma.ticketSatisfaction.update({
          where: { id: ticket.satisfaction.id },
          data,
        })
      : await this.prisma.ticketSatisfaction.create({ data });

    // Envoi mail
    const baseUrl = (await this.settings.get('app.publicUrl')) ?? 'https://crm.mdoservices.fr';
    const link = baseUrl.replace(/\/+$/, '') + '/nps/' + token;
    const contactName = ticket.contact ? ticket.contact.firstName : ticket.company.name;

    const html = `
      <p>Bonjour ${contactName},</p>
      <p>Votre ticket <strong>${ticket.reference}</strong> "${ticket.title}" vient d'etre marque comme resolu.</p>
      <p>Pour nous aider a ameliorer notre service, pourriez-vous prendre <strong>30 secondes</strong> pour evaluer votre experience ?</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${link}" style="background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;display:inline-block">Noter mon experience</a>
      </p>
      <p style="color:#64748b;font-size:12px">Ce lien est confidentiel et expire dans ${TOKEN_TTL_DAYS} jours.</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="color:#64748b;font-size:12px">
        MDO Services - Prestataire IT et Cybersecurite<br>
        <a href="https://www.mdoservices.fr">www.mdoservices.fr</a>
      </p>
    `;

    const result = await this.mail.send({
      to,
      subject: `[${ticket.reference}] Evaluez votre experience MDO Services`,
      html,
      relatedEntity: 'TicketSatisfaction',
      relatedEntityId: sat.id,
      tenantId: ticket.tenantId,
    });
    if (result.status !== 'SENT') {
      // On garde le record cree mais on remonte l'erreur (l'admin peut relancer).
      throw new BadRequestException('Echec envoi mail : ' + (result.error ?? 'inconnu'));
    }
    return sat;
  }

  /**
   * Resolution du token public : retourne les infos minimum a afficher sur la
   * page de notation. Pas d'auth requise.
   */
  async getByToken(token: string) {
    const sat = await this.prisma.ticketSatisfaction.findUnique({
      where: { token },
      include: {
        ticket: { select: { reference: true, title: true } },
      },
    });
    if (!sat) throw new NotFoundException('Lien invalide ou revoque.');
    if (sat.tokenExpiresAt < new Date()) {
      throw new BadRequestException('Ce lien a expire. Contactez MDO Services pour le re-emettre.');
    }
    return {
      reference: sat.ticket.reference,
      title: sat.ticket.title,
      alreadySubmitted: sat.submittedAt !== null,
      score: sat.score,
      comment: sat.comment,
    };
  }

  /**
   * Enregistre une note + commentaire. Si deja soumis, on refuse pour eviter le
   * "spam" de scores. L'admin peut renvoyer un nouveau lien si besoin.
   */
  async submit(
    token: string,
    score: number,
    comment: string | undefined,
    ctx: { ip?: string; userAgent?: string } = {},
  ) {
    if (!Number.isInteger(score) || score < 0 || score > 10) {
      throw new BadRequestException('La note doit etre un entier entre 0 et 10.');
    }
    const sat = await this.prisma.ticketSatisfaction.findUnique({ where: { token } });
    if (!sat) throw new NotFoundException('Lien invalide.');
    if (sat.tokenExpiresAt < new Date()) {
      throw new BadRequestException('Ce lien a expire.');
    }
    if (sat.submittedAt) {
      throw new BadRequestException('Vous avez deja soumis votre evaluation. Merci !');
    }
    return this.prisma.ticketSatisfaction.update({
      where: { token },
      data: {
        score,
        comment: comment?.trim() || null,
        submittedAt: new Date(),
        submittedIp: ctx.ip?.slice(0, 64),
        submittedUa: ctx.userAgent?.slice(0, 256),
      },
    });
  }

  /**
   * Statistiques NPS sur une periode (defaut 90 jours).
   * NPS = % promoteurs (9-10) - % detracteurs (0-6).
   */
  async stats(tenantId: string | null, periodDays = 90) {
    const since = subDays(new Date(), periodDays);
    // Scope tenant via la relation ticket (TicketSatisfaction n'a pas de tenantId direct).
    // Super-admin (tenantId null) voit l'ensemble.
    const ticketScope = tenantId ? { ticket: { tenantId } } : {};
    const submitted = await this.prisma.ticketSatisfaction.findMany({
      where: { submittedAt: { gte: since }, score: { not: null }, ...ticketScope },
      select: { score: true, comment: true, submittedAt: true, ticket: { select: { reference: true, title: true } } },
      orderBy: { submittedAt: 'desc' },
    });
    const total = submitted.length;
    if (total === 0) {
      return {
        periodDays,
        total: 0,
        nps: null,
        avgScore: null,
        promoters: 0,
        passives: 0,
        detractors: 0,
        responseRate: 0,
        recent: [],
      };
    }
    const promoters = submitted.filter((s) => (s.score ?? 0) >= 9).length;
    const passives = submitted.filter((s) => (s.score ?? 0) >= 7 && (s.score ?? 0) <= 8).length;
    const detractors = submitted.filter((s) => (s.score ?? 0) <= 6).length;
    const nps = ((promoters - detractors) / total) * 100;
    const avgScore = submitted.reduce((acc, s) => acc + (s.score ?? 0), 0) / total;

    // Taux de reponse : combien d'envois ont recu une reponse sur la periode
    const sentInPeriod = await this.prisma.ticketSatisfaction.count({
      where: { sentAt: { gte: since }, ...ticketScope },
    });
    const responseRate = sentInPeriod > 0 ? (total / sentInPeriod) * 100 : 0;

    return {
      periodDays,
      total,
      nps: Math.round(nps),
      avgScore: Math.round(avgScore * 10) / 10,
      promoters,
      passives,
      detractors,
      responseRate: Math.round(responseRate),
      recent: submitted.slice(0, 20),
    };
  }

  /**
   * Hook appele par TicketsService lorsque le statut d'un ticket passe a
   * RESOLVED. Envoie automatiquement la demande NPS si la setting est active.
   * Non-bloquant : les erreurs sont loggees, le ticket reste resolu.
   */
  async onTicketResolved(ticketId: string): Promise<void> {
    const enabled = await this.settings.getBool('nps.autoSendOnResolved');
    if (!enabled) return;
    try {
      await this.sendForTicket(ticketId);
      this.logger.log('NPS auto-envoye pour ticket ' + ticketId);
    } catch (err: any) {
      this.logger.warn('NPS auto non envoye pour ticket ' + ticketId + ' : ' + err.message);
    }
  }

  /** Liste des NPS d'un ticket donne (admin). Scope tenant via la relation ticket. */
  async getForTicket(ticketId: string, tenantId: string | null) {
    return this.prisma.ticketSatisfaction.findFirst({
      where: { ticketId, ...(tenantId ? { ticket: { tenantId } } : {}) },
    });
  }
}
