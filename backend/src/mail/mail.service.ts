import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';

interface ContractAlertParams {
  to: string;
  contract: {
    reference: string;
    title: string;
    endDate: Date;
    offer: string;
    monthlyAmountHt: number;
  };
  company: { name: string };
  daysBefore: number;
}

interface MailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

interface SendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  cc?: string;
  bcc?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: MailAttachment[];
  relatedEntity?: string;
  relatedEntityId?: string;
}

interface SendResult {
  messageId: string;
  status: 'SENT' | 'FAILED';
  error?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  // Cree un transporter a la volee a chaque envoi (les settings peuvent changer en runtime)
  private async buildTransporter(): Promise<nodemailer.Transporter | null> {
    const host = await this.settings.get('smtp.host');
    if (!host) return null;
    return nodemailer.createTransport({
      host,
      port: await this.settings.getInt('smtp.port', 587),
      secure: await this.settings.getBool('smtp.secure'),
      auth: {
        user: (await this.settings.get('smtp.user')) ?? '',
        pass: (await this.settings.get('smtp.password')) ?? '',
      },
    });
  }

  private async getFrom(): Promise<string> {
    return (await this.settings.get('smtp.from')) ?? 'no-reply@mdoservices.fr';
  }

  private async getSupportFrom(): Promise<string> {
    // Replies tickets : on prefere l'adresse IMAP (boite support@) si configuree
    return (await this.settings.get('imap.user')) ?? (await this.getFrom());
  }

  async generateMessageId(): Promise<string> {
    const supportFrom = await this.getSupportFrom();
    const domain = (supportFrom.match(/@([^>]+)>?$/)?.[1] ?? 'mdoservices.fr').trim();
    return '<' + randomBytes(16).toString('hex') + '@' + domain + '>';
  }

  async send(params: SendOptions): Promise<SendResult> {
    const log = await this.prisma.emailLog.create({
      data: {
        toEmail: params.to,
        subject: params.subject,
        bodyHtml: params.html,
        relatedEntity: params.relatedEntity,
        relatedEntityId: params.relatedEntityId,
      },
    });

    const transporter = await this.buildTransporter();
    if (!transporter) {
      this.logger.warn('Email non envoye (SMTP non configure) - to=' + params.to);
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', error: 'SMTP non configure' },
      });
      return { messageId: '', status: 'FAILED', error: 'SMTP non configure' };
    }

    const messageId = params.messageId ?? (await this.generateMessageId());
    const defaultFrom = await this.getFrom();

    try {
      await transporter.sendMail({
        from: params.from ?? defaultFrom,
        to: params.to,
        cc: params.cc,
        bcc: params.bcc,
        replyTo: params.replyTo,
        subject: params.subject,
        html: params.html,
        text: params.text,
        messageId,
        inReplyTo: params.inReplyTo,
        references: params.references,
        attachments: params.attachments,
      });
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
      return { messageId, status: 'SENT' };
    } catch (err: any) {
      this.logger.error('Echec envoi mail (' + params.to + ') : ' + err.message);
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', error: err.message },
      });
      return { messageId: '', status: 'FAILED', error: err.message };
    }
  }

  // ============================================================
  // Tickets : reply sortant + auto-acknowledgement
  // ============================================================

  async sendTicketReply(params: {
    to: string;
    cc?: string;
    bcc?: string;
    ticketReference: string;
    ticketTitle: string;
    body: string;
    authorName: string;
    signature?: string | null;
    inReplyTo?: string | null;
    references?: string[];
    attachments?: MailAttachment[];
    relatedEntityId?: string;
  }): Promise<SendResult> {
    const subject = '[' + params.ticketReference + '] ' + this.cleanSubject(params.ticketTitle);
    const signature = params.signature && params.signature.trim()
      ? params.signature.trim()
      : params.authorName + '\nMDO Services';

    const html = this.ticketReplyHtml({
      body: params.body,
      signature,
      ticketReference: params.ticketReference,
    });

    const text =
      params.body +
      '\n\n--\n' +
      signature +
      '\n\nReference : ' +
      params.ticketReference;

    const supportFrom = await this.getSupportFrom();
    return this.send({
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      from: supportFrom,
      replyTo: supportFrom,
      subject,
      html,
      text,
      inReplyTo: params.inReplyTo ?? undefined,
      references: params.references,
      attachments: params.attachments,
      relatedEntity: 'Ticket',
      relatedEntityId: params.relatedEntityId,
    });
  }

  async sendTicketAcknowledgement(params: {
    to: string;
    ticketReference: string;
    ticketTitle: string;
    inReplyTo?: string | null;
    references?: string[];
    relatedEntityId?: string;
  }): Promise<SendResult> {
    const subject = '[' + params.ticketReference + '] ' + this.cleanSubject(params.ticketTitle);
    const html = `
<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; color: #1f2937;">
  <p>Bonjour,</p>
  <p>Nous avons bien recu votre demande, elle est enregistree sous la reference <strong>${params.ticketReference}</strong> et sera traitee dans les meilleurs delais par notre equipe.</p>
  <p>Pour toute information complementaire, vous pouvez repondre a cet email en conservant la reference <code>[${params.ticketReference}]</code> dans le sujet.</p>
  <p>Cordialement,<br/>L'equipe MDO Services</p>
  <hr style="border: none; border-top: 1px solid #e5e7eb;"/>
  <p style="color:#6b7280; font-size:12px;">Email automatique - ne pas modifier la reference dans le sujet.</p>
</body></html>`;

    const supportFrom = await this.getSupportFrom();
    return this.send({
      to: params.to,
      from: supportFrom,
      replyTo: supportFrom,
      subject,
      html,
      text:
        'Bonjour,\n\nNous avons bien recu votre demande, enregistree sous la reference ' +
        params.ticketReference +
        '. Elle sera traitee dans les meilleurs delais.\n\nCordialement,\nL\'equipe MDO Services',
      inReplyTo: params.inReplyTo ?? undefined,
      references: params.references,
      relatedEntity: 'Ticket',
      relatedEntityId: params.relatedEntityId,
    });
  }

  private cleanSubject(s: string): string {
    return s.replace(/^(re|fw|fwd|tr)\s*:\s*/gi, '').trim() || '(sans sujet)';
  }

  private ticketReplyHtml(params: {
    body: string;
    signature: string;
    ticketReference: string;
  }): string {
    const safeBody = this.escapeHtml(params.body).replace(/\n/g, '<br/>');
    const safeSig = this.escapeHtml(params.signature).replace(/\n/g, '<br/>');
    return `
<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; color: #1f2937;">
  <div style="white-space: pre-wrap;">${safeBody}</div>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin-top: 20px;"/>
  <p style="color: #6b7280; font-size: 12px; margin: 8px 0 0 0;">
    ${safeSig}<br/>
    Reference : <strong>${params.ticketReference}</strong>
  </p>
</body></html>`;
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ============================================================
  // Contrats : alertes de renouvellement (existant)
  // ============================================================

  async sendContractRenewalAlert(params: ContractAlertParams) {
    const endDateFr = format(params.contract.endDate, 'PPP', { locale: fr });
    const urgency =
      params.daysBefore <= 7
        ? 'URGENT'
        : params.daysBefore <= 30
          ? 'IMPORTANT'
          : 'INFO';

    const subject =
      '[' +
      urgency +
      '] Contrat ' +
      params.contract.reference +
      ' - expiration dans ' +
      params.daysBefore +
      ' jours';

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
  <h2 style="color:#1d4ed8;">Renouvellement de contrat</h2>
  <p>Bonjour,</p>
  <p>Le contrat suivant arrive a echeance dans <strong>${params.daysBefore} jours</strong> :</p>
  <table style="border-collapse:collapse;width:100%;margin:20px 0;">
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Reference</strong></td><td style="padding:8px;border:1px solid #ddd;">${params.contract.reference}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Client</strong></td><td style="padding:8px;border:1px solid #ddd;">${params.company.name}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Offre</strong></td><td style="padding:8px;border:1px solid #ddd;">${params.contract.offer}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Date de fin</strong></td><td style="padding:8px;border:1px solid #ddd;">${endDateFr}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Montant mensuel HT</strong></td><td style="padding:8px;border:1px solid #ddd;">${params.contract.monthlyAmountHt.toFixed(2)} EUR</td></tr>
  </table>
  <p>Pensez a contacter le client pour le renouvellement.</p>
  <p style="color:#666;font-size:12px;">CRM MDO Services - notification automatique</p>
</body>
</html>`;

    await this.send({
      to: params.to,
      subject,
      html,
      text:
        'Le contrat ' +
        params.contract.reference +
        ' (' +
        params.company.name +
        ') expire dans ' +
        params.daysBefore +
        ' jours (fin: ' +
        endDateFr +
        ').',
      relatedEntity: 'Contract',
    });
  }
}
