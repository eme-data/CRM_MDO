import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { DecideTimesheetDto } from './dto/decide-timesheet.dto';

// SIRH - Feuilles de temps. Couche de validation RH au-dessus des TimeEntry :
//   - le collaborateur consulte sa semaine (heures agregees depuis TimeEntry) et
//     la soumet a validation ;
//   - ADMIN/MANAGER valident/refusent. Pas de 2e saisie de temps (le detail reste
//     dans "Mon temps"/TimeEntry).

function isManager(me: JwtUser): boolean {
  return me.isSuperAdmin || me.role === 'ADMIN' || me.role === 'MANAGER';
}
function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function mondayOf(d: Date): Date {
  const x = utcDay(d);
  const dow = x.getUTCDay(); // 0=dim..6=sam
  x.setUTCDate(x.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

@Injectable()
export class TimesheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
    private readonly notifications: NotificationsService,
  ) {}

  private weekBounds(weekStart?: string) {
    const base = weekStart ? new Date(weekStart.slice(0, 10) + 'T00:00:00.000Z') : new Date();
    const start = mondayOf(base);
    return { start, end: addDays(start, 6), endExclusive: addDays(start, 7) };
  }

  // Semaine de l'utilisateur : heures par jour (depuis TimeEntry) + statut feuille.
  async weekSummary(me: JwtUser, weekStart?: string) {
    const { start, end, endExclusive } = this.weekBounds(weekStart);
    const entries = await this.prisma.timeEntry.findMany({
      where: { userId: me.id, startedAt: { gte: start, lt: endExclusive } },
      select: { startedAt: true, durationMin: true },
    });
    const days = Array.from({ length: 7 }, (_, i) => ({ date: ymd(addDays(start, i)), minutes: 0 }));
    for (const e of entries) {
      const idx = Math.round((utcDay(e.startedAt).getTime() - start.getTime()) / 86_400_000);
      if (idx >= 0 && idx < 7) days[idx].minutes += e.durationMin ?? 0;
    }
    const totalMinutes = days.reduce((s, d) => s + d.minutes, 0);
    const timesheet = await this.prisma.timesheet.findFirst({ where: { userId: me.id, periodStart: start } });
    return { periodStart: ymd(start), periodEnd: ymd(end), days, totalMinutes, timesheet };
  }

  // Soumettre la semaine -> snapshot des minutes + statut SUBMITTED.
  async submit(me: JwtUser, weekStart?: string) {
    const { start, end, endExclusive } = this.weekBounds(weekStart);
    const agg = await this.prisma.timeEntry.aggregate({
      _sum: { durationMin: true },
      where: { userId: me.id, startedAt: { gte: start, lt: endExclusive } },
    });
    const total = agg._sum.durationMin ?? 0;
    if (total <= 0) throw new BadRequestException('Aucun temps saisi sur cette semaine');

    const ts = await this.prisma.timesheet.upsert({
      where: { tenantId_userId_periodStart: { tenantId: me.tenantId as any, userId: me.id, periodStart: start } },
      create: {
        tenantId: me.tenantId, userId: me.id, periodStart: start, periodEnd: end,
        status: 'SUBMITTED', submittedAt: new Date(), totalMinutes: total,
      },
      update: { status: 'SUBMITTED', submittedAt: new Date(), totalMinutes: total, approverId: null, decidedAt: null, decisionNote: null },
    });
    await this.notifyApprovers(me, ts);
    return ts;
  }

  private async notifyApprovers(me: JwtUser, ts: any) {
    const approvers = await this.prisma.user.findMany({
      where: { tenantId: me.tenantId, isActive: true, role: { in: ['ADMIN', 'MANAGER'] }, id: { not: me.id } },
      select: { id: true },
    });
    const requester = await this.prisma.user.findUnique({ where: { id: me.id }, select: { firstName: true, lastName: true } });
    const who = requester ? requester.firstName + ' ' + requester.lastName : 'Un collaborateur';
    for (const a of approvers) {
      await this.notifications.push({
        userId: a.id,
        title: 'Feuille de temps a valider',
        body: who + ' - semaine du ' + ymd(ts.periodStart) + ' (' + (ts.totalMinutes / 60).toFixed(1) + ' h)',
        entity: 'Timesheet', entityId: ts.id, url: '/feuilles',
      }).catch(() => {});
    }
  }

  async listMine(me: JwtUser) {
    return this.prisma.timesheet.findMany({
      where: { userId: me.id },
      include: { approver: { select: { firstName: true, lastName: true } } },
      orderBy: { periodStart: 'desc' },
      take: 26,
    });
  }

  async listPending(me: JwtUser) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux valideurs (ADMIN/MANAGER)');
    return this.prisma.timesheet.findMany({
      where: this.scope.scopedWhere(me, { status: TimesheetStatus.SUBMITTED }),
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { submittedAt: 'asc' },
    });
  }

  async decide(id: string, dto: DecideTimesheetDto, me: JwtUser) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux valideurs (ADMIN/MANAGER)');
    const ts = await this.prisma.timesheet.findFirst({ where: this.scope.scopedWhere(me, { id }) });
    if (!ts) throw new NotFoundException('Feuille introuvable');
    if (ts.status !== 'SUBMITTED') throw new BadRequestException('Feuille deja traitee (' + ts.status + ')');
    const status: TimesheetStatus = dto.approve ? 'APPROVED' : 'REJECTED';
    const updated = await this.prisma.timesheet.update({
      where: { id }, data: { status, approverId: me.id, decidedAt: new Date(), decisionNote: dto.note },
    });
    await this.notifications.push({
      userId: ts.userId,
      title: 'Feuille de temps ' + (dto.approve ? 'validee' : 'refusee'),
      body: 'Semaine du ' + ymd(ts.periodStart) + (dto.note ? ' - ' + dto.note : ''),
      entity: 'Timesheet', entityId: ts.id, url: '/feuilles',
    }).catch(() => {});
    return updated;
  }
}
