import { ForbiddenException, Injectable } from '@nestjs/common';
import { ExpenseStatus, LeaveStatus, TimesheetStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

// SIRH - Dashboard RH. Synthese transverse (lecture seule) agregeant les autres
// briques : effectifs, absences, validations en attente, entretiens a venir,
// parcours en cours. Reserve aux RH (ADMIN/MANAGER/super-admin).

function isManager(me: JwtUser): boolean {
  return me.isSuperAdmin || me.role === 'ADMIN' || me.role === 'MANAGER';
}
function utcToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

const userPick = { select: { id: true, firstName: true, lastName: true } };

@Injectable()
export class HrDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
  ) {}

  async summary(me: JwtUser) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux RH (ADMIN/MANAGER)');
    const today = utcToday();
    const in14 = addDays(today, 14);
    const w = (extra: Record<string, any>) => this.scope.scopedWhere(me, extra);

    const [
      headcount, absentToday, upcomingLeaves, pendingLeaves, pendingTimesheets,
      pendingExpenses, upcomingReviews, journeys, openObjectives,
    ] = await Promise.all([
      this.prisma.user.count({ where: w({ isActive: true }) }),
      this.prisma.leaveRequest.findMany({
        where: w({ status: LeaveStatus.APPROVED, startDate: { lte: today }, endDate: { gte: today } }),
        include: { user: userPick, type: { select: { name: true, color: true } } },
        orderBy: { endDate: 'asc' }, take: 50,
      }),
      this.prisma.leaveRequest.count({ where: w({ status: LeaveStatus.APPROVED, startDate: { gt: today, lte: in14 } }) }),
      this.prisma.leaveRequest.count({ where: w({ status: LeaveStatus.PENDING }) }),
      this.prisma.timesheet.count({ where: w({ status: TimesheetStatus.SUBMITTED }) }),
      this.prisma.expenseClaim.aggregate({ _count: true, _sum: { amountTtc: true }, where: w({ status: ExpenseStatus.PENDING }) }),
      this.prisma.review.findMany({
        where: w({ status: 'SCHEDULED', scheduledAt: { gte: today } }),
        include: { employee: userPick }, orderBy: { scheduledAt: 'asc' }, take: 6,
      }),
      this.prisma.journey.findMany({
        where: w({ status: 'IN_PROGRESS' }),
        include: { employee: userPick, tasks: { select: { done: true } } },
        orderBy: { startDate: 'asc' }, take: 10,
      }),
      this.prisma.objective.count({ where: w({ status: { in: ['TODO', 'IN_PROGRESS'] } }) }),
    ]);

    return {
      headcount,
      absentToday: absentToday.map((l) => ({
        userId: l.user.id, name: l.user.firstName + ' ' + l.user.lastName,
        typeName: l.type.name, color: l.type.color, until: l.endDate,
      })),
      counts: {
        upcomingLeaves,
        pendingLeaves,
        pendingTimesheets,
        pendingExpenses: pendingExpenses._count,
        pendingExpensesAmount: Number(pendingExpenses._sum.amountTtc ?? 0),
        openObjectives,
      },
      upcomingReviews: upcomingReviews.map((r) => ({
        id: r.id, type: r.type, scheduledAt: r.scheduledAt,
        employee: r.employee.firstName + ' ' + r.employee.lastName,
      })),
      activeJourneys: journeys.map((j) => ({
        id: j.id, title: j.title, kind: j.kind, startDate: j.startDate,
        employee: j.employee.firstName + ' ' + j.employee.lastName,
        done: j.tasks.filter((t) => t.done).length, total: j.tasks.length,
      })),
    };
  }
}
