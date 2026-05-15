import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';

const FAILURE_THRESHOLD = 5;

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  icon?: string;
  tag?: string;        // permet de remplacer une notification existante
  // Donnees libres exposees au handler 'notificationclick' du SW
  data?: Record<string, any>;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  // ============================================================
  // Configuration VAPID (lazy load)
  // ============================================================
  private async configure(): Promise<{ publicKey: string; privateKey: string; subject: string } | null> {
    const publicKey = await this.settings.get('push.vapidPublicKey');
    const privateKey = await this.settings.get('push.vapidPrivateKey');
    const subject = (await this.settings.get('push.vapidSubject')) ?? 'mailto:admin@example.com';
    if (!publicKey || !privateKey) return null;
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return { publicKey, privateKey, subject };
  }

  async getPublicKey(): Promise<string | null> {
    return this.settings.get('push.vapidPublicKey');
  }

  async generateAndStoreVapid() {
    const existing = await this.settings.get('push.vapidPublicKey');
    if (existing) {
      throw new BadRequestException(
        'Cles VAPID deja generees. Re-generer invaliderait TOUTES les souscriptions actuelles. Si vous voulez vraiment regenerer : effacez les Settings push.vapidPublicKey + push.vapidPrivateKey via l\'UI admin et reappellez.',
      );
    }
    const keys = webpush.generateVAPIDKeys();
    // updateSetting attend un userId — pour ce setup admin on prend le 1er ADMIN actif.
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });
    const userId = admin?.id ?? 'system';
    await this.settings.update('push.vapidPublicKey', keys.publicKey, userId);
    await this.settings.update('push.vapidPrivateKey', keys.privateKey, userId);
    return { publicKey: keys.publicKey };
  }

  // ============================================================
  // Subscriptions
  // ============================================================
  async subscribe(
    userId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ) {
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      throw new BadRequestException('Subscription incomplete (endpoint + keys requis)');
    }
    // upsert sur endpoint (un endpoint = un device, donc un seul user a la fois)
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent,
      },
      update: {
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent,
        failureCount: 0,
      },
    });
  }

  async unsubscribe(endpoint: string, userId?: string) {
    // Si userId fourni, on s'assure que la sub appartient bien au user (anti
    // suppression cross-user).
    const where = userId ? { endpoint, userId } : { endpoint };
    const r = await this.prisma.pushSubscription.deleteMany({ where });
    return { deleted: r.count };
  }

  async listForUser(userId: string) {
    return this.prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ============================================================
  // Envoi push
  // ============================================================
  async send(userId: string, payload: PushPayload) {
    const cfg = await this.configure();
    if (!cfg) {
      this.logger.debug('Push : VAPID non configure, send ignore');
      return { sent: 0, failed: 0 };
    }
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return { sent: 0, failed: 0 };

    const body = JSON.stringify(payload);
    let sent = 0;
    let failed = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
          );
          sent++;
          await this.prisma.pushSubscription.update({
            where: { id: s.id },
            data: { lastUsedAt: new Date(), failureCount: 0 },
          }).catch(() => {});
        } catch (err: any) {
          failed++;
          // 410 Gone / 404 = subscription expiree, on supprime
          const status = err?.statusCode ?? err?.status;
          if (status === 410 || status === 404) {
            await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          } else {
            const newCount = s.failureCount + 1;
            if (newCount >= FAILURE_THRESHOLD) {
              await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
              this.logger.warn('Subscription supprimee apres ' + FAILURE_THRESHOLD + ' echecs : ' + s.endpoint.slice(0, 50));
            } else {
              await this.prisma.pushSubscription.update({
                where: { id: s.id },
                data: { failureCount: newCount },
              }).catch(() => {});
            }
          }
        }
      }),
    );
    return { sent, failed };
  }

  async sendToUsers(userIds: string[], payload: PushPayload) {
    const results = await Promise.all(userIds.map((u) => this.send(u, payload)));
    return results.reduce(
      (acc, r) => ({ sent: acc.sent + r.sent, failed: acc.failed + r.failed }),
      { sent: 0, failed: 0 },
    );
  }

  async sendTest(userId: string) {
    const cfg = await this.configure();
    if (!cfg) throw new ServiceUnavailableException('VAPID non configure');
    return this.send(userId, {
      title: 'CRM MDO — test push',
      body: 'Si vous voyez ce message, votre navigateur est bien abonne aux notifications.',
      url: '/dashboard',
      tag: 'push-test',
    });
  }
}
