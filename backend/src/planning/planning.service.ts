import { Injectable } from '@nestjs/common';
import { LeaveStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { frenchHolidaysForRange } from '../leaves/holidays';

// SIRH - Planning d'equipe / presence. Vue mensuelle agregeant les conges
// APPROUVES de tous les collaborateurs du tenant + jours feries. Lecture seule
// (la saisie reste dans le module Conges). Visible par tous pour la visibilite
// d'equipe.

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

@Injectable()
export class PlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
  ) {}

  // month = 'YYYY-MM' (defaut : mois courant).
  async month(me: JwtUser, month?: string) {
    const base = month ? new Date(month + '-01T00:00:00.000Z') : new Date();
    const first = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
    const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));

    const dayCount = last.getUTCDate();
    const days: { date: string; weekend: boolean; holiday: boolean }[] = [];
    const holidaySet = frenchHolidaysForRange(first, last);
    for (let i = 0; i < dayCount; i++) {
      const d = addDays(first, i);
      const s = ymd(d);
      const dow = d.getUTCDay();
      days.push({ date: s, weekend: dow === 0 || dow === 6, holiday: holidaySet.has(s) });
    }

    const people = await this.prisma.user.findMany({
      where: this.scope.scopedWhere(me, { isActive: true }),
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    const leaves = await this.prisma.leaveRequest.findMany({
      where: this.scope.scopedWhere(me, {
        status: LeaveStatus.APPROVED,
        startDate: { lte: last },
        endDate: { gte: first },
      }),
      select: {
        userId: true, startDate: true, endDate: true, halfStart: true, halfEnd: true,
        type: { select: { name: true, color: true } },
      },
    });

    // Map userId -> { 'YYYY-MM-DD': {typeName, color, half} }
    const byUser = new Map<string, Record<string, { typeName: string; color: string; half: boolean }>>();
    for (const lv of leaves) {
      const startYmd = ymd(lv.startDate);
      const endYmd = ymd(lv.endDate);
      const from = lv.startDate < first ? first : lv.startDate;
      const to = lv.endDate > last ? last : lv.endDate;
      let cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
      const stop = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
      while (cur <= stop) {
        const s = ymd(cur);
        const dow = cur.getUTCDay();
        if (dow !== 0 && dow !== 6 && !holidaySet.has(s)) {
          const half = (s === startYmd && lv.halfStart) || (s === endYmd && lv.halfEnd);
          let map = byUser.get(lv.userId);
          if (!map) { map = {}; byUser.set(lv.userId, map); }
          map[s] = { typeName: lv.type.name, color: lv.type.color, half };
        }
        cur = addDays(cur, 1);
      }
    }

    return {
      month: ymd(first).slice(0, 7),
      days,
      people: people.map((p) => ({
        userId: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        leaves: byUser.get(p.id) ?? {},
      })),
    };
  }
}
