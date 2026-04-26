import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { connect as tlsConnect, TLSSocket } from 'tls';
import { differenceInDays, addDays } from 'date-fns';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const ALERT_DAYS = [60, 30, 14, 7, 3, 1];

export interface ProbeResult {
  ok: boolean;
  expiresAt?: Date;
  daysRemaining?: number;
  error?: string;
}

@Injectable()
export class SurveillanceService {
  private readonly logger = new Logger(SurveillanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // Cron quotidien a 7h : check tous les assets de type CERTIFICATE et DOMAIN
  @Cron('0 7 * * *')
  async dailyScan() {
    this.logger.log('Surveillance quotidienne demarree');
    const certs = await this.prisma.asset.findMany({
      where: { type: 'CERTIFICATE', status: 'ACTIVE' },
      include: { company: { select: { id: true, name: true, ownerId: true } } },
    });
    for (const c of certs) {
      const target = c.identifier;
      if (!target) continue;
      const result = await this.probeTlsCertificate(target);
      await this.handleProbeResult(c, result, 'CERTIFICATE');
    }

    const domains = await this.prisma.asset.findMany({
      where: { type: 'DOMAIN', status: 'ACTIVE' },
      include: { company: { select: { id: true, name: true, ownerId: true } } },
    });
    for (const d of domains) {
      // Pour les domaines on se contente de mettre a jour la base si l'expiration
      // est connue et de notifier en se basant sur expiresAt deja saisi.
      if (d.expiresAt) {
        const days = differenceInDays(d.expiresAt, new Date());
        await this.notifyAndOpenTicketIfNeeded(d, days, 'DOMAIN');
      }
    }
    this.logger.log('Surveillance terminee : ' + certs.length + ' certs, ' + domains.length + ' domains scannes');
  }

  // ================ Sondes ================

  async probeTlsCertificate(host: string, port = 443): Promise<ProbeResult> {
    return new Promise((resolve) => {
      const socket: TLSSocket = tlsConnect(
        port,
        host,
        { servername: host, rejectUnauthorized: false, timeout: 10000 },
        () => {
          const cert = socket.getPeerCertificate();
          socket.end();
          if (!cert || !cert.valid_to) {
            resolve({ ok: false, error: 'Pas de certificat recupere' });
            return;
          }
          const expires = new Date(cert.valid_to);
          resolve({
            ok: true,
            expiresAt: expires,
            daysRemaining: differenceInDays(expires, new Date()),
          });
        },
      );
      socket.on('error', (err) => resolve({ ok: false, error: err.message }));
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ ok: false, error: 'timeout' });
      });
    });
  }

  // Endpoint manuel pour declencher un scan immediat
  async runNow() {
    await this.dailyScan();
    return { ok: true };
  }

  async probeOne(assetId: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new Error('Asset introuvable');
    if (asset.type !== 'CERTIFICATE') {
      return { ok: false, error: 'Sonde TLS uniquement pour les CERTIFICATE pour l\'instant' };
    }
    const result = await this.probeTlsCertificate(asset.identifier ?? '');
    if (result.ok && result.expiresAt) {
      await this.prisma.asset.update({
        where: { id: assetId },
        data: { expiresAt: result.expiresAt },
      });
    }
    return result;
  }

  // ================ Handlers ================

  private async handleProbeResult(
    asset: any,
    result: ProbeResult,
    kind: 'CERTIFICATE' | 'DOMAIN',
  ) {
    if (!result.ok) {
      this.logger.warn(asset.name + ' : sonde echoue : ' + result.error);
      return;
    }
    if (result.expiresAt) {
      await this.prisma.asset.update({
        where: { id: asset.id },
        data: { expiresAt: result.expiresAt },
      });
    }
    const days = result.daysRemaining ?? 0;
    await this.notifyAndOpenTicketIfNeeded(asset, days, kind);
  }

  private async notifyAndOpenTicketIfNeeded(
    asset: any,
    daysRemaining: number,
    kind: 'CERTIFICATE' | 'DOMAIN',
  ) {
    if (daysRemaining < 0) {
      // Deja expire : ouvrir un ticket urgent si pas encore fait
      await this.openTicketIfNeeded(asset, kind, 'EXPIRED');
      return;
    }

    // Si proche d'un seuil et pas deja un ticket ouvert ces 7 derniers jours
    const seuilAtteint = ALERT_DAYS.find((d) => daysRemaining <= d) ?? null;
    if (seuilAtteint == null) return;

    await this.openTicketIfNeeded(asset, kind, 'EXPIRING_' + seuilAtteint + 'D');
  }

  private async openTicketIfNeeded(
    asset: any,
    kind: 'CERTIFICATE' | 'DOMAIN',
    code: string,
  ) {
    // Eviter doublon : pas de ticket OPEN/IN_PROGRESS deja existant pour ce code+asset
    const existing = await this.prisma.ticket.findFirst({
      where: {
        companyId: asset.companyId,
        status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER'] },
        title: { contains: '[' + code + ']' },
        description: { contains: asset.id },
      },
    });
    if (existing) return;

    // Trouver un user admin pour createdBy (FK obligatoire)
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });
    if (!admin) return;

    const reference = await this.generateRef();
    const isExpired = code === 'EXPIRED';
    const titlePrefix = '[' + code + '] ';
    const friendly = kind === 'CERTIFICATE' ? 'Certificat SSL' : 'Domaine';
    const title = titlePrefix + friendly + ' ' + (asset.identifier ?? asset.name);
    const description =
      'Surveillance automatique : ' + friendly + ' "' + asset.name + '" (' + (asset.identifier ?? '') + ') ' +
      (isExpired ? 'a EXPIRE' : 'expire bientot') + '.\n\n' +
      'Asset id : ' + asset.id + '\n' +
      'Date d\'expiration : ' + (asset.expiresAt ? asset.expiresAt.toISOString() : 'inconnue');

    const ticket = await this.prisma.ticket.create({
      data: {
        reference,
        title,
        description,
        status: 'OPEN',
        priority: isExpired ? 'URGENT' : 'HIGH',
        category: 'INCIDENT',
        channel: 'INTERNAL',
        companyId: asset.companyId,
        assigneeId: asset.company?.ownerId ?? admin.id,
        createdById: admin.id,
        dueDate: addDays(new Date(), isExpired ? 1 : 3),
      },
    });

    if (asset.company?.ownerId) {
      await this.notifications.push({
        userId: asset.company.ownerId,
        type: 'TICKET_ASSIGNED',
        title: 'Surveillance : ' + friendly + ' ' + (isExpired ? 'expire' : 'a renouveler'),
        body: asset.company.name + ' - ' + asset.name,
        entity: 'Ticket',
        entityId: ticket.id,
        url: '/tickets/' + ticket.id,
      });
    }
  }

  private async generateRef(): Promise<string> {
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
}
