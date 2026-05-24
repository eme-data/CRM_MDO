import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AssetType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { checkSslCertificate } from './ssl-checker';
import { checkDomainWhois } from './whois-checker';

const ALERT_THRESHOLDS_DAYS = [30, 14, 7, 1];
const WEEKLY_DIGEST_HORIZON_DAYS = 60;

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
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

    // Email en plus de la notif in-app (si SMTP configure et owner a un email)
    const owner = await this.prisma.user.findUnique({
      where: { id: recipient },
      select: { email: true, isActive: true },
    });
    if (owner?.email && owner.isActive) {
      try {
        await this.mail.sendAssetExpiryAlert({
          to: owner.email,
          kind,
          daysRemaining,
          asset: { id: asset.id, name: asset.name, identifier: asset.identifier },
          company: { name: asset.company.name },
          tenantId: asset.tenantId,
        });
      } catch (err: any) {
        this.logger.warn('Email alerte ' + kind + ' echoue (' + asset.id + ') : ' + err.message);
      }
    }
  }

  // ----------- Vue consolidee -----------
  // Vue d'ensemble pour la page Surveillance : repartition par bucket
  // d'urgence + liste triee + erreurs de check.
  async overview() {
    const now = Date.now();
    const horizon90 = new Date(now + 90 * 86_400_000);

    const [tracked, untracked, items, errors] = await Promise.all([
      this.prisma.asset.count({
        where: {
          type: { in: [AssetType.CERTIFICATE, AssetType.DOMAIN] },
          status: 'ACTIVE',
          monitoringEnabled: true,
        },
      }),
      this.prisma.asset.count({
        where: {
          type: { in: [AssetType.CERTIFICATE, AssetType.DOMAIN] },
          status: 'ACTIVE',
          monitoringEnabled: false,
        },
      }),
      this.prisma.asset.findMany({
        where: {
          type: { in: [AssetType.CERTIFICATE, AssetType.DOMAIN] },
          status: 'ACTIVE',
          monitoringEnabled: true,
          expiresAt: { not: null, lte: horizon90 },
        },
        include: { company: { select: { id: true, name: true } } },
        orderBy: { expiresAt: 'asc' },
        take: 200,
      }),
      this.prisma.asset.findMany({
        where: {
          type: { in: [AssetType.CERTIFICATE, AssetType.DOMAIN] },
          status: 'ACTIVE',
          monitoringEnabled: true,
          monitoringError: { not: null },
        },
        include: { company: { select: { id: true, name: true } } },
        orderBy: { lastMonitoredAt: 'desc' },
        take: 50,
      }),
    ]);

    const buckets = { expired: 0, in7: 0, in30: 0, in60: 0, in90: 0 };
    const enriched = items.map((a) => {
      const days = Math.floor((a.expiresAt!.getTime() - now) / 86_400_000);
      if (days < 0) buckets.expired++;
      else if (days <= 7) buckets.in7++;
      else if (days <= 30) buckets.in30++;
      else if (days <= 60) buckets.in60++;
      else if (days <= 90) buckets.in90++;
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        identifier: a.identifier,
        expiresAt: a.expiresAt,
        daysRemaining: days,
        lastMonitoredAt: a.lastMonitoredAt,
        company: a.company,
      };
    });

    return {
      counts: {
        tracked,
        untracked,
        withErrors: errors.length,
        ...buckets,
      },
      items: enriched,
      errors: errors.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        identifier: a.identifier,
        monitoringError: a.monitoringError,
        lastMonitoredAt: a.lastMonitoredAt,
        company: a.company,
      })),
    };
  }

  // ----------- Crons -----------
  // Une fois par jour a 5h : tous les certs SSL et tous les domaines
  // dont monitoringEnabled = true.
  @Cron('0 5 * * *', { name: 'monitoring-daily', timeZone: 'Europe/Paris' })
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

  // Recap hebdomadaire : tous les lundis a 8h, on envoie a chaque owner
  // la liste de ses certificats / domaines qui expirent dans les 60 jours.
  @Cron('0 8 * * 1', { name: 'monitoring-weekly-digest', timeZone: 'Europe/Paris' })
  async weeklyDigest() {
    const horizon = new Date(Date.now() + WEEKLY_DIGEST_HORIZON_DAYS * 86_400_000);
    const assets = await this.prisma.asset.findMany({
      where: {
        type: { in: [AssetType.CERTIFICATE, AssetType.DOMAIN] },
        status: 'ACTIVE',
        monitoringEnabled: true,
        expiresAt: { not: null, lte: horizon, gte: new Date(Date.now() - 7 * 86_400_000) },
      },
      include: {
        company: { select: { name: true, ownerId: true } },
      },
    });

    // Group by ownerId
    const byOwner = new Map<string, typeof assets>();
    for (const a of assets) {
      const owner = a.company.ownerId;
      if (!owner) continue;
      const list = byOwner.get(owner) ?? [];
      list.push(a);
      byOwner.set(owner, list);
    }

    let sent = 0;
    for (const [ownerId, list] of byOwner) {
      const user = await this.prisma.user.findUnique({
        where: { id: ownerId },
        select: { email: true, isActive: true, tenantId: true },
      });
      if (!user?.email || !user.isActive) continue;

      try {
        await this.mail.sendAssetWeeklyDigest({
          to: user.email,
          items: list
            .filter((a) => a.expiresAt)
            .map((a) => ({
              kind: a.type === AssetType.CERTIFICATE ? 'SSL' : 'DOMAIN',
              daysRemaining: Math.floor((a.expiresAt!.getTime() - Date.now()) / 86_400_000),
              assetName: a.name,
              identifier: a.identifier,
              companyName: a.company.name,
              expiresAt: a.expiresAt!,
            })),
          tenantId: user.tenantId,
        });
        sent++;
      } catch (err: any) {
        this.logger.warn('Recap hebdo (owner ' + ownerId + ') echoue : ' + err.message);
      }
    }

    this.logger.log('Recap hebdo envoye a ' + sent + ' utilisateur(s)');
    return { recipients: sent };
  }
}
