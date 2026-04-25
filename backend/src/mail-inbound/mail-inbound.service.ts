import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ImapFlow, FetchMessageObject } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';

const TICKET_REF_RE = /\[(TKT-\d{4}-\d{4,6})\]/i;

@Injectable()
export class MailInboundService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailInboundService.name);
  private enabled = false;
  private polling = false;
  private config!: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    folder: string;
    processedFolder: string | null;
  };

  private autoAck = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    this.enabled = this.configService.get<string>('inbound.enabled') === 'true';
    if (!this.enabled) {
      this.logger.log('Inbound email desactive (INBOUND_EMAIL_ENABLED != true)');
      return;
    }
    this.config = {
      host: this.configService.get<string>('inbound.host') ?? '',
      port: parseInt(this.configService.get<string>('inbound.port') ?? '993', 10),
      secure: this.configService.get<string>('inbound.secure') !== 'false',
      user: this.configService.get<string>('inbound.user') ?? '',
      password: this.configService.get<string>('inbound.password') ?? '',
      folder: this.configService.get<string>('inbound.folder') ?? 'INBOX',
      processedFolder: this.configService.get<string>('inbound.processedFolder') || null,
    };
    if (!this.config.host || !this.config.user || !this.config.password) {
      this.logger.warn('Inbound email active mais config incomplete (IMAP_HOST/USER/PASSWORD)');
      this.enabled = false;
      return;
    }
    this.autoAck = this.configService.get<string>('inbound.autoAck') === 'true';
    this.logger.log(
      'Inbound email actif sur ' + this.config.user + '@' + this.config.host + ':' + this.config.port +
      ' (auto-ack=' + this.autoAck + ')',
    );
  }

  onModuleDestroy() {
    // rien a fermer, les connexions sont par poll
  }

  // Toutes les 2 minutes
  @Cron('*/2 * * * *')
  async poll() {
    if (!this.enabled || this.polling) return;
    this.polling = true;
    try {
      await this.processMailbox();
    } catch (err: any) {
      this.logger.error('Erreur polling IMAP : ' + err.message);
    } finally {
      this.polling = false;
    }
  }

  private async processMailbox() {
    const client = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: { user: this.config.user, pass: this.config.password },
      logger: false,
    });

    await client.connect();
    try {
      const lock = await client.getMailboxLock(this.config.folder);
      try {
        // Cherche les non-lus
        const uids = await client.search({ seen: false }, { uid: true });
        if (!uids || uids.length === 0) return;
        this.logger.log(uids.length + ' email(s) a traiter');

        for await (const message of client.fetch(uids, { source: true, envelope: true, uid: true })) {
          try {
            await this.processMessage(message);
            // Marquer comme lu
            await client.messageFlagsAdd(message.uid, ['\\Seen'], { uid: true });
            // Deplacer si configure
            if (this.config.processedFolder) {
              try {
                await client.messageMove(message.uid, this.config.processedFolder, { uid: true });
              } catch (err: any) {
                this.logger.warn(
                  'Impossible de deplacer vers ' + this.config.processedFolder + ' : ' + err.message + ' (le dossier existe-t-il ?)',
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

  private async processMessage(message: FetchMessageObject) {
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

    // 1. Ticket existant via In-Reply-To / References (le plus fiable)
    let existingTicket = null as null | { id: string; reference: string; status: string };
    const refIds = [inReplyTo, ...references].filter(Boolean) as string[];
    if (refIds.length > 0) {
      const matched = await this.prisma.ticketMessage.findFirst({
        where: { messageId: { in: refIds } },
        select: { ticket: { select: { id: true, reference: true, status: true } } },
      });
      if (matched?.ticket) existingTicket = matched.ticket;
    }

    // 2. Fallback : reference dans le sujet
    if (!existingTicket) {
      const refMatch = subject.match(TICKET_REF_RE);
      if (refMatch) {
        const reference = refMatch[1].toUpperCase();
        const t = await this.prisma.ticket.findUnique({
          where: { reference },
          select: { id: true, reference: true, status: true },
        });
        if (t) existingTicket = t;
      }
    }

    if (existingTicket) {
      await this.prisma.ticketMessage.create({
        data: {
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
      this.logger.log('Message ajoute au ticket ' + existingTicket.reference + ' depuis ' + senderEmail);
      return;
    }

    // 3. Resoudre Contact + Company
    const { companyId, contactId } = await this.resolveSender(senderEmail);
    if (!companyId) {
      this.logger.warn(
        'Pas de Company correspondant a ' + senderEmail + ' - email ignore (creer la societe avant)',
      );
      return;
    }

    // 4. Creer le ticket + premier message + (optionnel) accuse de reception
    const reference = await this.generateReference();
    const cleanTitle = this.cleanSubject(subject);
    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          reference,
          title: cleanTitle,
          description: textBody,
          status: 'OPEN',
          priority: 'NORMAL',
          category: 'INCIDENT',
          channel: 'EMAIL',
          companyId,
          contactId,
          createdById: await this.systemUserId(),
        },
      });
      await tx.ticketMessage.create({
        data: {
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
      return created;
    });

    this.logger.log('Ticket ' + ticket.reference + ' cree depuis ' + senderEmail);

    // 5. Auto-acknowledgement
    if (this.autoAck) {
      try {
        const ackRefs = [incomingMessageId, ...references].filter(Boolean) as string[];
        const ackResult = await this.mail.sendTicketAcknowledgement({
          to: senderEmail,
          ticketReference: ticket.reference,
          ticketTitle: cleanTitle,
          inReplyTo: incomingMessageId,
          references: ackRefs,
          relatedEntityId: ticket.id,
        });
        if (ackResult.status === 'SENT' && ackResult.messageId) {
          // On stocke le messageId de l'ack dans un message interne pour tracer le thread
          await this.prisma.ticketMessage.create({
            data: {
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

  private async resolveSender(
    email: string,
  ): Promise<{ companyId: string | null; contactId: string | null }> {
    // Match contact par email exact
    const contact = await this.prisma.contact.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, companyId: true },
    });
    if (contact?.companyId) {
      return { companyId: contact.companyId, contactId: contact.id };
    }
    // Match company par domaine de l'email
    const domain = email.split('@')[1];
    if (domain) {
      const company = await this.prisma.company.findFirst({
        where: {
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

  private async generateReference(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = 'TKT-' + year + '-';
    const last = await this.prisma.ticket.findFirst({
      where: { reference: { startsWith: prefix } },
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
  // On utilise le 1er admin actif comme "user systeme".
  private async systemUserId(): Promise<string> {
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!admin) {
      throw new Error('Aucun ADMIN actif - impossible de creer un ticket via email');
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
