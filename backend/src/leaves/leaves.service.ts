import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LeaveStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { DecideLeaveDto } from './dto/decide-leave.dto';
import { SetAllocationDto } from './dto/set-allocation.dto';

// SIRH - Conges & absences (multi-tenant).
//   - Tout collaborateur cree des demandes pour LUI-MEME (userId = me.id).
//   - Les ADMIN/MANAGER du tenant valident/refusent et gerent les soldes.
//   - Decompte en jours ouvres (week-ends exclus ; jours feries = v2).
//   - Cloisonnement tenant strict via TenantScope.

const DEFAULT_TYPES = [
  { name: 'Conges payes', color: '#3b82f6', paid: true },
  { name: 'RTT', color: '#8b5cf6', paid: true },
  { name: 'Sans solde', color: '#64748b', paid: false },
  { name: 'Maladie', color: '#ef4444', paid: false },
  { name: 'Autre', color: '#14b8a6', paid: true },
];

function isManager(me: JwtUser): boolean {
  return me.isSuperAdmin || me.role === 'ADMIN' || me.role === 'MANAGER';
}

function atUtcMidnight(ymd: string): Date {
  return new Date(ymd.slice(0, 10) + 'T00:00:00.000Z');
}

@Injectable()
export class LeavesService {
  private readonly logger = new Logger(LeavesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  // ---------- Types ----------
  // Seed paresseux : a la 1ere consultation d'un tenant, on cree les types par defaut.
  private async ensureTypes(tenantId: string | null): Promise<void> {
    const count = await this.prisma.leaveType.count({ where: { tenantId } });
    if (count > 0) return;
    await this.prisma.leaveType.createMany({
      data: DEFAULT_TYPES.map((t) => ({ ...t, tenantId })),
    });
  }

  async listTypes(me: JwtUser) {
    await this.ensureTypes(me.tenantId);
    return this.prisma.leaveType.findMany({
      where: this.scope.scopedWhere(me, { active: true }),
      orderBy: { name: 'asc' },
    });
  }

  // ---------- Jours ouvres ----------
  private workingDays(start: Date, end: Date, halfStart: boolean, halfEnd: boolean): number {
    if (start > end) throw new BadRequestException('La date de fin doit etre apres la date de debut');
    let count = 0;
    const d = new Date(start);
    while (d <= end) {
      const day = d.getUTCDay(); // 0=dim, 6=sam
      if (day !== 0 && day !== 6) count++;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    if (count <= 0) throw new BadRequestException('Aucun jour ouvre sur la periode selectionnee');
    const sameDay = start.getTime() === end.getTime();
    if (sameDay) {
      return halfStart || halfEnd ? 0.5 : count;
    }
    const startWeekday = start.getUTCDay() !== 0 && start.getUTCDay() !== 6;
    const endWeekday = end.getUTCDay() !== 0 && end.getUTCDay() !== 6;
    let days = count;
    if (halfStart && startWeekday) days -= 0.5;
    if (halfEnd && endWeekday) days -= 0.5;
    return Math.max(0.5, days);
  }

  // ---------- Demandes ----------
  async create(dto: CreateLeaveDto, me: JwtUser) {
    await this.ensureTypes(me.tenantId);
    const type = await this.prisma.leaveType.findFirst({
      where: this.scope.scopedWhere(me, { id: dto.typeId, active: true }),
    });
    if (!type) throw new NotFoundException('Type de conge introuvable');

    const start = atUtcMidnight(dto.startDate);
    const end = atUtcMidnight(dto.endDate);
    const days = this.workingDays(start, end, dto.halfStart ?? false, dto.halfEnd ?? false);

    const req = await this.prisma.leaveRequest.create({
      data: {
        tenantId: me.tenantId,
        userId: me.id,
        typeId: dto.typeId,
        startDate: start,
        endDate: end,
        halfStart: dto.halfStart ?? false,
        halfEnd: dto.halfEnd ?? false,
        workingDays: days,
        reason: dto.reason,
        status: 'PENDING',
      },
      include: { type: true },
    });

    // Notifie les valideurs (ADMIN/MANAGER du tenant) — in-app.
    await this.notifyApprovers(me, req);
    return req;
  }

  private async notifyApprovers(me: JwtUser, req: any) {
    const approvers = await this.prisma.user.findMany({
      where: {
        tenantId: me.tenantId,
        isActive: true,
        role: { in: ['ADMIN', 'MANAGER'] },
        id: { not: me.id },
      },
      select: { id: true },
    });
    const requester = await this.prisma.user.findUnique({
      where: { id: me.id },
      select: { firstName: true, lastName: true },
    });
    const who = requester ? requester.firstName + ' ' + requester.lastName : 'Un collaborateur';
    for (const a of approvers) {
      await this.notifications.push({
        userId: a.id,
        title: 'Demande de conge a valider',
        body: who + ' - ' + Number(req.workingDays) + ' j (' + req.type.name + ')',
        entity: 'LeaveRequest',
        entityId: req.id,
        url: '/conges',
      }).catch(() => {});
    }
  }

  // Mes demandes
  async listMine(me: JwtUser) {
    return this.prisma.leaveRequest.findMany({
      where: { userId: me.id },
      include: { type: true, approver: { select: { firstName: true, lastName: true } } },
      orderBy: { startDate: 'desc' },
      take: 100,
    });
  }

  // En attente de validation (valideurs uniquement)
  async listPending(me: JwtUser) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux valideurs (ADMIN/MANAGER)');
    return this.prisma.leaveRequest.findMany({
      where: this.scope.scopedWhere(me, { status: LeaveStatus.PENDING }),
      include: {
        type: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Conges valides a venir (calendrier equipe)
  async teamUpcoming(me: JwtUser) {
    const today = atUtcMidnight(new Date().toISOString());
    return this.prisma.leaveRequest.findMany({
      where: this.scope.scopedWhere(me, {
        status: LeaveStatus.APPROVED,
        endDate: { gte: today },
      }),
      include: {
        type: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { startDate: 'asc' },
      take: 200,
    });
  }

  // Validation / refus
  async decide(id: string, dto: DecideLeaveDto, me: JwtUser) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux valideurs (ADMIN/MANAGER)');
    const req = await this.prisma.leaveRequest.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: { type: true, user: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true, tenantId: true } } },
    });
    if (!req) throw new NotFoundException('Demande introuvable');
    if (req.status !== 'PENDING') throw new BadRequestException('Demande deja traitee (' + req.status + ')');

    const status: LeaveStatus = dto.approve ? 'APPROVED' : 'REJECTED';
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status, approverId: me.id, decidedAt: new Date(), decisionNote: dto.note },
      include: { type: true },
    });

    await this.notifyDecision(req, status, dto.note);
    return updated;
  }

  private async notifyDecision(req: any, status: LeaveStatus, note?: string) {
    const verb = status === 'APPROVED' ? 'validee' : 'refusee';
    const periode = this.fmtPeriod(req.startDate, req.endDate);
    await this.notifications.push({
      userId: req.userId,
      title: 'Demande de conge ' + verb,
      body: req.type.name + ' ' + periode + (note ? ' - ' + note : ''),
      entity: 'LeaveRequest',
      entityId: req.id,
      url: '/conges',
    }).catch(() => {});

    if (req.user?.email && req.user.isActive) {
      const color = status === 'APPROVED' ? '#059669' : '#b91c1c';
      const html =
        '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1f2937;">' +
        '<h2 style="color:' + color + ';">Demande de conge ' + verb + '</h2>' +
        '<p>Votre demande de <strong>' + req.type.name + '</strong> (' + periode + ', ' + Number(req.workingDays) + ' jour(s)) a ete <strong>' + verb + '</strong>.</p>' +
        (note ? '<p><em>Commentaire : ' + note + '</em></p>' : '') +
        '<p style="color:#666;font-size:12px;">SIRH - notification automatique.</p></body></html>';
      try {
        await this.mail.send({
          to: req.user.email,
          subject: '[Conges] Demande ' + verb,
          html,
          relatedEntity: 'LeaveRequest',
          relatedEntityId: req.id,
          tenantId: req.user.tenantId,
        });
      } catch (err: any) {
        this.logger.warn('Email decision conge echoue : ' + err.message);
      }
    }
  }

  // Annulation (par le demandeur tant que PENDING/a venir, ou par un valideur)
  async cancel(id: string, me: JwtUser) {
    const req = await this.prisma.leaveRequest.findFirst({
      where: this.scope.scopedWhere(me, { id }),
    });
    if (!req) throw new NotFoundException('Demande introuvable');
    const isOwner = req.userId === me.id;
    if (!isOwner && !isManager(me)) throw new ForbiddenException('Action non autorisee');
    if (req.status === 'CANCELLED') return req;
    if (req.status === 'REJECTED') throw new BadRequestException('Demande deja refusee');
    // Un demandeur ne peut annuler qu'une demande non encore passee.
    if (isOwner && !isManager(me) && req.endDate < atUtcMidnight(new Date().toISOString())) {
      throw new BadRequestException('Impossible d\'annuler un conge deja passe');
    }
    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: 'CANCELLED', decidedAt: new Date(), approverId: me.id },
    });
  }

  // ---------- Soldes ----------
  // Soldes de l'utilisateur courant pour l'annee : alloue / pris / restant par type.
  async myBalances(me: JwtUser, year?: number) {
    return this.balancesForUser(me, me.id, year);
  }

  private async balancesForUser(me: JwtUser, userId: string, year?: number) {
    await this.ensureTypes(me.tenantId);
    const y = year ?? new Date().getUTCFullYear();
    const yearStart = new Date(Date.UTC(y, 0, 1));
    const yearEnd = new Date(Date.UTC(y, 11, 31));
    const types = await this.prisma.leaveType.findMany({
      where: this.scope.scopedWhere(me, { active: true }),
      orderBy: { name: 'asc' },
    });
    const balances = await this.prisma.leaveBalance.findMany({ where: { userId, year: y } });
    const approved = await this.prisma.leaveRequest.findMany({
      where: { userId, status: 'APPROVED', startDate: { gte: yearStart, lte: yearEnd } },
      select: { typeId: true, workingDays: true },
    });
    const takenByType = new Map<string, number>();
    for (const r of approved) {
      takenByType.set(r.typeId, (takenByType.get(r.typeId) ?? 0) + Number(r.workingDays));
    }
    return {
      year: y,
      items: types.map((t) => {
        const allocated = Number(balances.find((b) => b.typeId === t.id)?.allocated ?? 0);
        const taken = takenByType.get(t.id) ?? 0;
        return {
          typeId: t.id,
          type: t.name,
          color: t.color,
          paid: t.paid,
          allocated,
          taken,
          remaining: allocated - taken,
        };
      }),
    };
  }

  // Definir l'allocation annuelle d'un collaborateur (valideurs uniquement).
  async setAllocation(dto: SetAllocationDto, me: JwtUser) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux valideurs (ADMIN/MANAGER)');
    // Garde tenant : l'utilisateur cible doit appartenir au tenant courant.
    const target = await this.prisma.user.findFirst({
      where: this.scope.scopedWhere(me, { id: dto.userId }),
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Collaborateur introuvable dans ce tenant');
    const type = await this.prisma.leaveType.findFirst({
      where: this.scope.scopedWhere(me, { id: dto.typeId }),
      select: { id: true },
    });
    if (!type) throw new NotFoundException('Type de conge introuvable');

    return this.prisma.leaveBalance.upsert({
      where: {
        tenantId_userId_typeId_year: {
          tenantId: me.tenantId as any,
          userId: dto.userId,
          typeId: dto.typeId,
          year: dto.year,
        },
      },
      create: {
        tenantId: me.tenantId,
        userId: dto.userId,
        typeId: dto.typeId,
        year: dto.year,
        allocated: dto.allocated,
      },
      update: { allocated: dto.allocated },
    });
  }

  // Vue valideur : soldes de tous les collaborateurs du tenant.
  async allBalances(me: JwtUser, year?: number) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux valideurs (ADMIN/MANAGER)');
    const users = await this.prisma.user.findMany({
      where: this.scope.scopedWhere(me, { isActive: true }),
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: 'asc' },
    });
    const result = [];
    for (const u of users) {
      const b = await this.balancesForUser(me, u.id, year);
      result.push({ user: u, ...b });
    }
    return result;
  }

  private fmtPeriod(start: Date, end: Date): string {
    const f = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
    return start.getTime() === end.getTime() ? 'le ' + f(start) : 'du ' + f(start) + ' au ' + f(end);
  }
}
