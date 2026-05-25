import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { CreateMonitorDto } from './dto/create-monitor.dto';
import { UpdateMonitorDto } from './dto/update-monitor.dto';
import { assertSafePublicUrl } from '../common/http/safe-fetch';

const HTTP_TIMEOUT_MS = 10_000;
const FAIL_THRESHOLD_FOR_ALERT = 3; // 3 echecs consecutifs = incident + alerte
const CHECK_RETENTION_DAYS = 30;

export interface ProbeResult {
  isUp: boolean;
  httpCode: number | null;
  responseMs: number;
  error: string | null;
}

@Injectable()
export class UptimeService {
  private readonly logger = new Logger(UptimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  // ----------- CRUD -----------

  list(me: JwtUser, companyId?: string) {
    return this.prisma.uptimeMonitor.findMany({
      where: this.scope.scopedWhere(me, companyId ? { companyId } : {}),
      include: { company: { select: { id: true, name: true } } },
      orderBy: [{ enabled: 'desc' }, { name: 'asc' }],
    });
  }

  async get(id: string, me: JwtUser) {
    const m = await this.prisma.uptimeMonitor.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: { company: { select: { id: true, name: true, ownerId: true } } },
    });
    if (!m) throw new NotFoundException('Monitor introuvable');
    return m;
  }

  async getDetail(id: string, me: JwtUser) {
    const monitor = await this.get(id, me);
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const [recentChecks, openIncidents, recentIncidents, totalChecks24h, downChecks24h] = await Promise.all([
      this.prisma.uptimeCheck.findMany({
        where: { monitorId: id },
        orderBy: { checkedAt: 'desc' },
        take: 100,
      }),
      this.prisma.uptimeIncident.findMany({
        where: { monitorId: id, endedAt: null },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.uptimeIncident.findMany({
        where: { monitorId: id, endedAt: { not: null } },
        orderBy: { startedAt: 'desc' },
        take: 20,
      }),
      this.prisma.uptimeCheck.count({ where: { monitorId: id, checkedAt: { gte: since } } }),
      this.prisma.uptimeCheck.count({ where: { monitorId: id, checkedAt: { gte: since }, isUp: false } }),
    ]);
    const uptime24h = totalChecks24h === 0 ? null : ((totalChecks24h - downChecks24h) / totalChecks24h) * 100;
    return { monitor, recentChecks, openIncidents, recentIncidents, uptime24h };
  }

  async create(dto: CreateMonitorDto, me: JwtUser) {
    if (dto.companyId) await this.scope.assertCompanyInTenant(dto.companyId, me);
    // Anti-SSRF des la creation : refuse les URLs vers IP privee/loopback.
    // Recheck egalement a chaque probe (cf probe()) pour bloquer les attaques
    // de DNS rebinding.
    await assertSafePublicUrl(dto.url);
    return this.prisma.uptimeMonitor.create({
      data: {
        tenantId: me.tenantId,
        name: dto.name,
        url: dto.url,
        method: dto.method ?? 'GET',
        expectedStatus: dto.expectedStatus ?? 200,
        intervalMinutes: dto.intervalMinutes ?? 5,
        enabled: dto.enabled ?? true,
        companyId: dto.companyId ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateMonitorDto, me: JwtUser) {
    await this.get(id, me);
    if (dto.url) await assertSafePublicUrl(dto.url);
    return this.prisma.uptimeMonitor.update({ where: { id }, data: dto as any });
  }

  async remove(id: string, me: JwtUser) {
    await this.get(id, me);
    await this.prisma.uptimeMonitor.delete({ where: { id } });
    return { success: true };
  }

  // ----------- Probe -----------

  private async probe(monitor: { url: string; method: string; expectedStatus: number }): Promise<ProbeResult> {
    const start = Date.now();
    try {
      await assertSafePublicUrl(monitor.url);
    } catch (err: any) {
      return { isUp: false, httpCode: null, responseMs: 0, error: 'URL refusee : ' + err.message };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
    try {
      const r = await fetch(monitor.url, {
        method: monitor.method,
        signal: ctrl.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'CRM-MDO-Uptime/1.0' },
      });
      const responseMs = Date.now() - start;
      const isUp = r.status === monitor.expectedStatus;
      return {
        isUp,
        httpCode: r.status,
        responseMs,
        error: isUp ? null : 'HTTP ' + r.status + ' (attendu : ' + monitor.expectedStatus + ')',
      };
    } catch (err: any) {
      const responseMs = Date.now() - start;
      const reason = err.name === 'AbortError' ? 'Timeout (' + HTTP_TIMEOUT_MS + 'ms)' : (err.message ?? 'Erreur reseau');
      return { isUp: false, httpCode: null, responseMs, error: reason };
    } finally {
      clearTimeout(timer);
    }
  }

  async checkOne(id: string, me: JwtUser) {
    const monitor = await this.get(id, me);
    return this.runCheck(monitor);
  }

  private async runCheck(monitor: any) {
    const result = await this.probe(monitor);

    await this.prisma.uptimeCheck.create({
      data: {
        monitorId: monitor.id,
        isUp: result.isUp,
        httpCode: result.httpCode,
        responseMs: result.responseMs,
        error: result.error,
      },
    });

    const consecutive = result.isUp ? 0 : (monitor.consecutiveFailures ?? 0) + 1;

    await this.prisma.uptimeMonitor.update({
      where: { id: monitor.id },
      data: {
        lastCheckedAt: new Date(),
        lastStatus: result.isUp ? 'UP' : 'DOWN',
        lastHttpCode: result.httpCode,
        lastResponseMs: result.responseMs,
        lastError: result.error,
        consecutiveFailures: consecutive,
      },
    });

    // Gestion incident
    if (!result.isUp && consecutive === FAIL_THRESHOLD_FOR_ALERT) {
      await this.openIncident(monitor, result.error ?? 'inconnu');
    } else if (result.isUp && monitor.lastStatus === 'DOWN') {
      await this.closeIncident(monitor);
    }

    return result;
  }

  private async openIncident(monitor: any, reason: string) {
    const existing = await this.prisma.uptimeIncident.findFirst({
      where: { monitorId: monitor.id, endedAt: null },
    });
    if (existing) {
      if (existing.reason !== reason) {
        await this.prisma.uptimeIncident.update({ where: { id: existing.id }, data: { reason } });
      }
      return;
    }

    await this.prisma.uptimeIncident.create({
      data: { monitorId: monitor.id, startedAt: new Date(), reason },
    });

    await this.alertOwner(monitor, 'DOWN', reason);
    await this.prisma.uptimeMonitor.update({
      where: { id: monitor.id },
      data: { alertSentAt: new Date() },
    });
  }

  private async closeIncident(monitor: any) {
    const open = await this.prisma.uptimeIncident.findFirst({
      where: { monitorId: monitor.id, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!open) return;
    const now = new Date();
    const duration = Math.floor((now.getTime() - open.startedAt.getTime()) / 1000);
    await this.prisma.uptimeIncident.update({
      where: { id: open.id },
      data: { endedAt: now, durationSeconds: duration },
    });

    await this.alertOwner(monitor, 'UP', 'Site retabli (' + this.fmtDuration(duration) + ' d\'indisponibilite)');
  }

  private fmtDuration(sec: number): string {
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.floor(sec / 60) + 'min';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h + 'h' + (m > 0 ? m + 'min' : '');
  }

  // Alerte le owner du monitor. Mail envoye via le SMTP du tenant proprietaire.
  private async alertOwner(monitor: any, status: 'UP' | 'DOWN', message: string) {
    const ownerId = monitor.company?.ownerId;
    if (!ownerId) return;

    const title = status === 'DOWN'
      ? 'Site DOWN : ' + monitor.name
      : 'Site retabli : ' + monitor.name;

    await this.notifications.push({
      userId: ownerId,
      title,
      body: monitor.url + ' - ' + message,
      entity: 'UptimeMonitor',
      entityId: monitor.id,
      url: '/uptime/' + monitor.id,
    });

    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { email: true, isActive: true, tenantId: true },
    });
    if (owner?.email && owner.isActive) {
      try {
        await this.mail.sendUptimeAlert({
          to: owner.email,
          status,
          monitor: { id: monitor.id, name: monitor.name, url: monitor.url },
          companyName: monitor.company?.name ?? 'inconnu',
          message,
          tenantId: owner.tenantId,
        });
      } catch (err: any) {
        this.logger.warn('Email uptime echoue (' + monitor.id + ') : ' + err.message);
      }
    }
  }

  // ----------- Cron -----------

  // Toutes les 5 minutes, on verifie tous les monitors actifs dont la derniere
  // verification est suffisamment ancienne pour respecter intervalMinutes.
  // Cron systeme global : itere TOUS les monitors tous tenants (probe HTTP
  // sortante neutre). Les notifications/emails sont rattachees au tenant
  // du monitor via owner.tenantId.
  @Cron('*/5 * * * *')
  async tick() {
    // Try/catch racine : si findMany throw (DB indispo, lock), on log et on
    // ne tue pas le scheduler @nestjs/schedule (qui arreterait TOUS les crons).
    try {
      const now = Date.now();
      const monitors = await this.prisma.uptimeMonitor.findMany({
        where: { enabled: true },
        include: { company: { select: { id: true, name: true, ownerId: true } } },
      });
      let checked = 0;
      for (const m of monitors) {
        const minMs = m.intervalMinutes * 60 * 1000;
        if (m.lastCheckedAt && now - m.lastCheckedAt.getTime() < minMs - 30_000) continue;
        try {
          await this.runCheck(m);
          checked++;
        } catch (err: any) {
          this.logger.warn('Uptime check ' + m.id + ' echec : ' + err.message);
        }
      }
      if (checked > 0) this.logger.log('Uptime tick : ' + checked + ' check(s) effectue(s)');
    } catch (err: any) {
      this.logger.error('Uptime tick cron a echoue : ' + (err?.message ?? err));
    }
  }

  // Purge quotidienne des checks vieux de plus de 30j (a 4h, avant le monitoring SSL).
  @Cron('0 4 * * *', { name: 'uptime-purge-old-checks', timeZone: 'Europe/Paris' })
  async purgeOldChecks() {
    try {
      const cutoff = new Date(Date.now() - CHECK_RETENTION_DAYS * 86_400_000);
      const r = await this.prisma.uptimeCheck.deleteMany({ where: { checkedAt: { lt: cutoff } } });
      if (r.count > 0) this.logger.log('Purge uptime : ' + r.count + ' check(s) supprime(s)');
      return r;
    } catch (err: any) {
      this.logger.error('Uptime purge cron a echoue : ' + (err?.message ?? err));
      return { count: 0 };
    }
  }

  // ----------- Vue dashboard - scope par tenant -----------

  async overview(me: JwtUser) {
    const monitors = await this.prisma.uptimeMonitor.findMany({
      where: this.scope.scopedWhere(me),
      include: { company: { select: { id: true, name: true } } },
      orderBy: [{ enabled: 'desc' }, { lastStatus: 'asc' }, { name: 'asc' }],
    });
    const counts = {
      total: monitors.length,
      up: monitors.filter((m) => m.lastStatus === 'UP').length,
      down: monitors.filter((m) => m.lastStatus === 'DOWN').length,
      unknown: monitors.filter((m) => !m.lastStatus).length,
    };
    return { counts, monitors };
  }
}
