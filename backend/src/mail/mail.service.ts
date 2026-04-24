import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PrismaService } from '../database/prisma.service';

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

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter?: nodemailer.Transporter;
  private from!: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const host = this.configService.get<string>('smtp.host');
    if (!host) {
      this.logger.warn('SMTP non configure : envoi desactive');
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: this.configService.get<number>('smtp.port'),
      secure: this.configService.get<boolean>('smtp.secure'),
      auth: {
        user: this.configService.get<string>('smtp.user'),
        pass: this.configService.get<string>('smtp.password'),
      },
    });
    this.from = this.configService.get<string>('smtp.from') ?? 'no-reply@mdoservices.fr';
  }

  async send(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    relatedEntity?: string;
    relatedEntityId?: string;
  }) {
    const log = await this.prisma.emailLog.create({
      data: {
        toEmail: params.to,
        subject: params.subject,
        bodyHtml: params.html,
        relatedEntity: params.relatedEntity,
        relatedEntityId: params.relatedEntityId,
      },
    });

    if (!this.transporter) {
      this.logger.warn('Email non envoye (SMTP down) - toEmail=' + params.to);
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', error: 'SMTP non configure' },
      });
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (err: any) {
      this.logger.error('Echec envoi mail: ' + err.message);
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', error: err.message },
      });
      throw err;
    }
  }

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
