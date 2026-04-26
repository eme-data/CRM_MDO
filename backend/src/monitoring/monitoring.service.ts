import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AssetType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { checkSslCertificate } from './ssl-checker';
import { checkDomainWhois } from './whois-checker';

const ALERT_THRESHOLDS_DAYS = [30, 14, 7, 1];

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // Verifie un asset CERTIFICATE / DOMAIN et met a jour expiresAt + lastMonitoredAt
  async checkOne(assetId: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { company: { select: { id: true, name: true, ownerId: true } } },
    });
    if (!asset) return { ok: false, error: 'Asset introuvable' };
    if (!asset.identifier) return { ok: false, error: 'Identifier vide (renseignez le FQDN ou le domaine)' };

    if (asset.type === AssetType.CERTIFICATE) {
      return this.runSslCheck(asset);
    }
    if (asset.type === AssetType.DOMAIN) {
      return this.runWhoisCheck(asset);
    }
    return { ok: false, error: 'Asset non monitorable (type ' + asset.type + ')' };
  }

  private async runSslCheck(asset: any) {
    const r = await checkSslCertificate(asset.identifier);
    const data: any = { lastMonitoredAt: new Date(), monitoringError: r.ok ? null : r.error ?? null };
    if (r.ok && r.validTo) {
      data.expiresAt = r.validTo;
      // Mise a jour de la note avec les infos cert
      const meta =
        '\n\n[Auto-monitoring SSL]\n- Subject : ' +
        (r.subject ?? '?') +
        '\n- Issuer : ' +
        (r.issuer ?? '?') +
        '\n- Verifie le ' +
        new Date().toISOString();
      data.notes = (asset.notes ?? '').replace(/\n*\[Auto-monitoring SSL\][\s\S]*$/, '') + meta;
    }
    await this.prisma.asset.update({ where: { id: asset.id }, data });
    if (r.ok && r.daysRemaining !== undefined) {
      await this.maybeAlertExpiry(asset, r.daysRemaining, 'SSL');
    }
    return r;
  }

  private async runWhoisCheck(asset: any) {
    const r = await checkDomainWhois(asset.identifier);
    const data: any = { lastMonitoredAt: new Date(), monitoringError: r.ok ? null : r.error ?? null };
    if (r.ok && r.expiresAt) {
      data.expiresAt = r.expiresAt;
      if (r.registrar) {
        data.vendor = r.registrar;
      }
    }
    await this.prisma.asset.update({ where: { id: asset.id }, data });
    if (r.ok && r.expiresAt) {
      const days = Math.floor((r.expiresAt.getTime() - Date.now()) / 86_400_000);
      await this.maybeAlertExpiry(asset, days, 'DOMAIN');
    }
    return r;
  }

  private async maybeAlertExpiry(asset: any, daysRemaining: number, kind: 'SSL' | 'DOMAIN') {
    // On alerte une fois par seuil franchi
    const threshold = ALERT_THRESHOLDS_DAYS.find((t) => daysRemaining <= t && daysRemaining >= 0);
    if (threshold === undefined) return;

    const recipient = asset.company.ownerId;
    if (!recipient) return;

    // Anti-doublon : pas deux fois la meme notif sur les 24h
    const since = new Date(Date.now() - 86_400_000);
    const existing = await this.prisma.notification.findFirst({
      where: {
        userId: recipient,
        entity: 'Asset',
        entityId: asset.id,
        createdAt: { gte: since },
      },
    });
    if (existing) return;

    const label = kind === 'SSL' ? 'Certificat SSL' : 'Domaine';
    await this.notifications.push({
      userId: recipient,
      title: label + ' expire dans ' + daysRemaining + ' jour(s)',
      body: asset.company.name + ' - ' + (asset.identifier ?? asset.name),
      entity: 'Asset',
      entityId: asset.id,
      url: '/assets',
    });
  }

  // ----------- Crons -----------
  // Une fois par jour a 5h : tous les certs SSL et tous les domaines
  // dont monitoringEnabled = true.
  @Cron('0 5 * * *')
  async dailyMonitor() {
    const candidates = await this.prisma.asset.findMany({
      where: {
        monitoringEnabled: true,
        identifier: { not: null },
        type: { in: [AssetType.CERTIFICATE, AssetType.DOMAIN] },
        status: { in: ['ACTIVE'] },
      },
      include: { company: { select: { id: true, name: true, ownerId: true } } },
    });
    this.logger.log('Monitoring : ' + candidates.length + ' asset(s) a verifier');
    let ok = 0;
    let ko = 0;
    // Sequentiel pour ne pas saturer (whois est lent et a quotas)
    for (const a of candidates) {
      try {
        const r =
          a.type === AssetType.CERTIFICATE
            ? await this.runSslCheck(a)
            : await this.runWhoisCheck(a);
        if (r.ok) ok++; else ko++;
      } catch (err: any) {
        ko++;
        this.logger.warn('Monitoring asset ' + a.id + ' echec : ' + err.message);
      }
    }
    this.logger.log('Monitoring termine : ' + ok + ' OK / ' + ko + ' KO');
    return { checked: candidates.length, ok, ko };
  }
}
