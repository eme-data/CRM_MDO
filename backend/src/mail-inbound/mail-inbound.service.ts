import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ImapFlow, FetchMessageObject } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { SettingsService } from '../settings/settings.service';
import { SlaService } from '../tickets/sla.service';
import { NotificationsService } from '../notifications/notifications.service';
import { withUniqueRetry } from '../common/db/unique-retry';

const TICKET_REF_RE = /\[(TKT-\d{4}-\d{4,6})\]/i;

interface InboundConfig {
  enabled: boolean;
  autoAck: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  folder: string;
  processedFolder: string | null;
  tenantId: string | null;
}

@Injectable()
export class MailInboundService {
  private readonly logger = new Logger(MailInboundService.name);
  private polling = false;

  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly attachmentsService: AttachmentsService,
    private readonly sla: SlaService,
    private readonly notifications: NotificationsService,
  ) {}

  // Charge la config IMAP pour un tenant donne. En multi-tenant, chaque
  // tenant a sa propre BAL support@. Quand tenantId=null, on lit la config
  // globale (compat MDO single-instance).
  private async loadConfig(tenantId: string | null): Promise<InboundConfig> {
    return {
      tenantId,
      enabled: await this.settings.getBool('imap.enabled', tenantId),
      autoAck: await this.settings.getBool('imap.autoAck', tenantId),
      host: (await this.settings.get('imap.host', tenantId)) ?? '',
      port: await this.settings.getInt('imap.port', 993, tenantId),
      secure: (await this.settings.get('imap.secure', tenantId)) !== 'false',
      user: (await this.settings.get('imap.user', tenantId)) ?? '',
      password: (await this.settings.get('imap.password', tenantId)) ?? '',
      folder: (await this.settings.get('imap.folder', tenantId)) ?? 'INBOX',
      processedFolder: (await this.settings.get('imap.processedFolder', tenantId)) || null,
    };
  }

  // Toutes les 2 minutes — poll PAR TENANT. Chaque tenant a son propre IMAP.
  @Cron('*/2 * * * *')
  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const tenants = await this.prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      for (const t of tenants) {
        try {
          const config = await this.loadConfig(t.id);
          if (!config.enabled) continue;
          if (!config.host || !config.user || !config.password) {
            this.logger.warn('IMAP active mais config incomplete pour tenant ' + t.id);
            continue;
          }
          await this.processMailbox(config);
        } catch (err: any) {
          this.logger.error('Erreur polling IMAP tenant ' + t.id + ' : ' + err.message);
        }
      }
    } finally {
      this.polling = false;
    }
  }

  private async processMailbox(config: InboundConfig) {
    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      logger: false,
      // Timeouts explicites : un serveur IMAP injoignable/lent ne doit pas faire
      // trainer le polling (le cron itere les tenants en serie). greetingTimeout
      // borne la phase de connexion, socketTimeout l'inactivite socket.
      greetingTimeout: 15_000,
      socketTimeout: 60_000,
    });

    await client.connect();
    try {
      const lock = await client.getMailboxLock(config.folder);
      try {
        const uids = await client.search({ seen: false }, { uid: true });
        if (!uids || uids.length === 0) return;
        this.logger.log('[tenant ' + (config.tenantId ?? 'global') + '] ' + uids.length + ' email(s) a traiter');

        for await (const message of client.fetch(uids, { source: true, envelope: true, uid: true })) {
          try {
            await this.processMessage(message, config);
            await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
            if (config.processedFolder) {
              try {
                await client.messageMove(message.uid, config.processedFolder, { uid: true });
              } catch (err: any) {
                this.logger.warn(
                  'Impossible de deplacer vers ' + config.processedFolder + ' : ' + err.message + ' (le dossier existe-t-il ?)',
                );
              }
            }
          } catch (err: any) {
            this.logger.error('Erreur traitement uid=' + message.uid + ' : ' + err.message);
          }
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }
  }

  private async processMessage(message: FetchMessageObject, config: InboundConfig) {
    const parsed: ParsedMail = await simpleParser(message.source as Buffer);

    const fromAddr = parsed.from?.value?.[0];
    if (!fromAddr?.address) {
      this.logger.warn('Email sans adresse expediteur, ignore');
      return;
    }
    const senderEmail = fromAddr.address.toLowerCase();
    const senderName = fromAddr.name || '';

    const subject = (parsed.subject || '(sans sujet)').trim();
    const textBody =
      parsed.text ||
      (parsed.html ? this.htmlToText(parsed.html) : '(corps vide)');

    const incomingMessageId = (parsed.messageId || '').trim() || null;
    const inReplyTo = (parsed.inReplyTo || '').trim() || null;
    const references: string[] = Array.isArray(parsed.references)
      ? parsed.references
      : parsed.references
        ? [parsed.references]
        : [];

    // 1. Ticket existant via In-Reply-To / References (le plus fiable).
    // Scope tenant : on cherche uniquement dans les tickets du tenant courant.
    let existingTicket = null as null | { id: string; reference: string; status: string; assigneeId: string | null; title: string };
    const refIds = [inReplyTo, ...references].filter(Boolean) as string[];
    if (refIds.length > 0) {
      const matched = await this.prisma.ticketMessage.findFirst({
        where: {
          messageId: { in: refIds },
          ...(config.tenantId ? { tenantId: config.tenantId } : {}),
        },
        select: {
          ticket: {
            select: { id: true, reference: true, status: true, assigneeId: true, title: true },
          },
        },
      });
      if (matched?.ticket) existingTicket = matched.ticket;
    }

    // 2. Fallback : reference dans le sujet, scopee par tenant.
    if (!existingTicket) {
      const refMatch = subject.match(TICKET_REF_RE);
      if (refMatch) {
        const reference = refMatch[1].toUpperCase();
        const t = await this.prisma.ticket.findFirst({
          where: {
            reference,
            ...(config.tenantId ? { tenantId: config.tenantId } : {}),
          },
          select: { id: true, reference: true, status: true, assigneeId: true, title: true },
        });
        if (t) existingTicket = t;
      }
    }

    if (existingTicket) {
      const newMsg = await this.prisma.ticketMessage.create({
        data: {
          tenantId: config.tenantId,
          ticketId: existingTicket.id,
          authorId: null,
          authorName: senderName || null,
          authorEmail: senderEmail,
          content: textBody,
          isInternal: false,
          messageId: incomingMessageId,
          inReplyTo,
          viaEmail: true,
        },
      });
      await this.saveAttachments(parsed, existingTicket.id, newMsg.id);
      if (
        existingTicket.status === 'CLOSED' ||
        existingTicket.status === 'RESOLVED' ||
        existingTicket.status === 'WAITING_CUSTOMER'
      ) {
        await this.prisma.ticket.update({
          where: { id: existingTicket.id },
          data: { status: 'IN_PROGRESS' },
        });
      }
      // Notifier l'assignee qu'un nouveau message client est arrive
      if (existingTicket.assigneeId) {
        await this.notifications.push({
          userId: existingTicket.assigneeId,
          type: 'TICKET_NEW_MESSAGE',
          title: 'Nouveau message sur ' + existingTicket.reference,
          body: senderName || senderEmail,
          entity: 'Ticket',
          entityId: existingTicket.id,
          url: '/tickets/' + existingTicket.id,
        });
      }
      this.logger.log('Message ajoute au ticket ' + existingTicket.reference + ' depuis ' + senderEmail);
      return;
    }

    // 3. Resoudre Contact + Company DANS LE MEME TENANT
    const { companyId, contactId } = await this.resolveSender(senderEmail, config.tenantId);
    if (!companyId) {
      this.logger.warn(
        'Pas de Company correspondant a ' + senderEmail + ' dans le tenant ' + (config.tenantId ?? 'global') +
        ' - email ignore (creer la societe avant)',
      );
      return;
    }

    // 4. Creer le ticket + premier message + (optionnel) accuse de reception
    const cleanTitle = this.cleanSubject(subject);
    const dueDate = await this.sla.computeDueDate(companyId, 'NORMAL');
    const systemUserId = await this.systemUserId(config.tenantId);
    // Retry anti-TOCTOU sur reference (un email entrant + ticket cree manuel
    // peuvent calculer la meme TKT-2026-XXXXX). Cf withUniqueRetry.
    const { ticket, firstMessage } = await withUniqueRetry(
      () => this.generateReference(config.tenantId),
      (reference) => this.prisma.$transaction(async (tx) => {
        const created = await tx.ticket.create({
          data: {
            tenantId: config.tenantId,
            reference,
            title: cleanTitle,
            description: textBody,
            status: 'OPEN',
            priority: 'NORMAL',
            category: 'INCIDENT',
            channel: 'EMAIL',
            dueDate,
            companyId,
            contactId,
            createdById: systemUserId,
          },
        });
        const msg = await tx.ticketMessage.create({
          data: {
            tenantId: config.tenantId,
            ticketId: created.id,
            authorId: null,
            authorName: senderName || null,
            authorEmail: senderEmail,
            content: textBody,
            isInternal: false,
            messageId: incomingMessageId,
            inReplyTo,
            viaEmail: true,
          },
        });
        return { ticket: created, firstMessage: msg };
      }),
    );

    await this.saveAttachments(parsed, ticket.id, firstMessage.id);

    this.logger.log('Ticket ' + ticket.reference + ' cree depuis ' + senderEmail);

    // 5. Auto-acknowledgement (envoie via le SMTP du tenant)
    if (config.autoAck) {
      try {
        const ackRefs = [incomingMessageId, ...references].filter(Boolean) as string[];
        const ackResult = await this.mail.sendTicketAcknowledgement({
          to: senderEmail,
          ticketReference: ticket.reference,
          ticketTitle: cleanTitle,
          inReplyTo: incomingMessageId,
          references: ackRefs,
          relatedEntityId: ticket.id,
          tenantId: config.tenantId,
        });
        if (ackResult.status === 'SENT' && ackResult.messageId) {
          // On stocke le messageId de l'ack dans un message interne pour tracer le thread
          await this.prisma.ticketMessage.create({
            data: {
              tenantId: config.tenantId,
              ticketId: ticket.id,
              authorId: null,
              authorName: 'Accuse automatique',
              content: '(accuse de reception envoye a ' + senderEmail + ')',
              isInternal: true,
              messageId: ackResult.messageId,
              inReplyTo: incomingMessageId,
              viaEmail: true,
            },
          });
        }
      } catch (err: any) {
        this.logger.error('Echec auto-ack ticket ' + ticket.reference + ' : ' + err.message);
      }
    }
  }

  private async saveAttachments(parsed: ParsedMail, ticketId: string, messageId: string) {
    if (!parsed.attachments || parsed.attachments.length === 0) return;
    for (const att of parsed.attachments) {
      // Skip les attachements inline (ex: images integrees, signatures)
      if (att.contentDisposition === 'inline' && !att.filename) continue;
      const filename = att.filename || 'attachment';
      try {
        await this.attachmentsService.saveBuffer(
          {
            originalname: filename,
            mimetype: att.contentType || 'application/octet-stream',
            size: att.size ?? att.content.length,
            buffer: att.content,
          },
          { uploadedById: null, ticketId, ticketMessageId: messageId },
        );
      } catch (err: any) {
        this.logger.warn('Echec sauvegarde attachment ' + filename + ' : ' + err.message);
      }
    }
  }

  // Match contact / company DANS LE TENANT du IMAP. Sinon un email entrant
  // d'un domaine commun (ex: orange.fr) pourrait etre rattache au mauvais
  // contact d'un autre tenant.
  private async resolveSender(
    email: string,
    tenantId: string | null,
  ): Promise<{ companyId: string | null; contactId: string | null }> {
    const tenantWhere = tenantId ? { tenantId } : {};
    // Match contact par email exact dans le tenant
    const contact = await this.prisma.contact.findFirst({
      where: { ...tenantWhere, email: { equals: email, mode: 'insensitive' } },
      select: { id: true, companyId: true },
    });
    if (contact?.companyId) {
      return { companyId: contact.companyId, contactId: contact.id };
    }
    // Match company par domaine de l'email dans le tenant
    const domain = email.split('@')[1];
    if (domain) {
      const company = await this.prisma.company.findFirst({
        where: {
          ...tenantWhere,
          OR: [
            { email: { endsWith: '@' + domain, mode: 'insensitive' } },
            { website: { contains: domain, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      if (company) {
        return { companyId: company.id, contactId: contact?.id ?? null };
      }
    }
    return { companyId: null, contactId: contact?.id ?? null };
  }

  private async generateReference(tenantId: string | null): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = 'TKT-' + year + '-';
    // Reference unique par tenant : on lit la derniere DU TENANT pour
    // continuer la sequence. Sinon deux tenants re-utiliseraient les memes
    // numeros, et bien que ca passe la contrainte @@unique([tenantId,
    // reference]), c'est confus pour la communication client.
    const last = await this.prisma.ticket.findFirst({
      where: {
        ...(tenantId ? { tenantId } : {}),
        reference: { startsWith: prefix },
      },
      orderBy: { reference: 'desc' },
      select: { reference: true },
    });
    let next = 1;
    if (last) {
      const m = last.reference.match(/(\d+)$/);
      if (m) next = parseInt(m[1], 10) + 1;
    }
    return prefix + String(next).padStart(5, '0');
  }

  // Le ticket cree par email a besoin d'un createdBy (FK obligatoire).
  // On utilise le 1er admin actif DU TENANT comme "user systeme".
  private async systemUserId(tenantId: string | null): Promise<string> {
    const admin = await this.prisma.user.findFirst({
      where: {
        role: 'ADMIN',
        isActive: true,
        ...(tenantId ? { tenantId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) {
      throw new Error('Aucun ADMIN actif dans le tenant - impossible de creer un ticket via email');
    }
    return admin.id;
  }

  private cleanSubject(subject: string): string {
    return subject
      .replace(/^(re|fw|fwd|tr)\s*:\s*/gi, '')
      .replace(TICKET_REF_RE, '')
      .trim() || '(sans sujet)';
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
