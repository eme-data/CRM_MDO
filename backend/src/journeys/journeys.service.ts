import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JourneyKind } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { CreateJourneyDto } from './dto/create-journey.dto';
import { AddTaskDto, ToggleTaskDto } from './dto/journey-task.dto';

// SIRH - Parcours collaborateur (onboarding / offboarding RH). Checklists
// d'arrivee / depart, materialisees par collaborateur. Distinct du module
// Onboarding CLIENT. Manager = ADMIN/MANAGER/super-admin.

function isManager(me: JwtUser): boolean {
  return me.isSuperAdmin || me.role === 'ADMIN' || me.role === 'MANAGER';
}
function addDays(ymd: string, n: number): Date {
  const d = new Date(ymd.slice(0, 10) + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
function kindLabel(k: JourneyKind): string {
  return k === 'OFFBOARDING' ? 'depart' : 'arrivee';
}

const employeePick = { select: { id: true, firstName: true, lastName: true } };
// JourneyTask (avec echeance) : tri ordre puis date.
const tasksOrder = { orderBy: [{ order: 'asc' as const }, { dueDate: 'asc' as const }] };
// JourneyTemplateTask : pas de champ dueDate -> tri sur l'ordre uniquement.
const tplTasksOrder = { orderBy: { order: 'asc' as const } };

@Injectable()
export class JourneysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------- Modeles de checklist ----------

  async listTemplates(me: JwtUser, kind?: JourneyKind) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux managers');
    const extra: Record<string, any> = {};
    if (kind) extra.kind = kind;
    return this.prisma.journeyTemplate.findMany({
      where: this.scope.scopedWhere(me, extra),
      include: { tasks: tplTasksOrder, _count: { select: { journeys: true } } },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
  }

  async createTemplate(me: JwtUser, dto: CreateTemplateDto) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux managers');
    return this.prisma.journeyTemplate.create({
      data: {
        tenantId: me.tenantId,
        name: dto.name,
        kind: dto.kind ?? 'ONBOARDING',
        tasks: {
          create: dto.tasks.map((t, i) => ({
            label: t.label, description: t.description, responsible: t.responsible,
            offsetDays: t.offsetDays ?? null, order: i,
          })),
        },
      },
      include: { tasks: tplTasksOrder },
    });
  }

  async deleteTemplate(me: JwtUser, id: string) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux managers');
    const tpl = await this.prisma.journeyTemplate.findFirst({ where: this.scope.scopedWhere(me, { id }), select: { id: true } });
    if (!tpl) throw new NotFoundException('Modele introuvable');
    await this.prisma.journeyTemplate.delete({ where: { id } });
    return { ok: true };
  }

  // ---------- Parcours ----------

  async listMine(me: JwtUser) {
    return this.prisma.journey.findMany({
      where: { employeeId: me.id, status: { not: 'CANCELLED' } },
      include: { tasks: tasksOrder },
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async listManaged(me: JwtUser) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux managers');
    return this.prisma.journey.findMany({
      where: this.scope.scopedWhere(me),
      include: { employee: employeePick, tasks: tasksOrder },
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getOne(me: JwtUser, id: string) {
    const journey = await this.prisma.journey.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: { employee: employeePick, tasks: tasksOrder },
    });
    if (!journey) throw new NotFoundException('Parcours introuvable');
    if (!isManager(me) && journey.employeeId !== me.id) throw new ForbiddenException();
    return journey;
  }

  async create(me: JwtUser, dto: CreateJourneyDto) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux managers');
    const employee = await this.prisma.user.findFirst({
      where: this.scope.scopedWhere(me, { id: dto.employeeId }),
      select: { id: true, firstName: true, lastName: true },
    });
    if (!employee) throw new NotFoundException('Collaborateur introuvable');

    let template = null as null | { id: string; name: string; kind: JourneyKind; tasks: { label: string; description: string | null; responsible: string | null; offsetDays: number | null; order: number }[] };
    if (dto.templateId) {
      template = await this.prisma.journeyTemplate.findFirst({
        where: this.scope.scopedWhere(me, { id: dto.templateId }),
        include: { tasks: tplTasksOrder },
      });
      if (!template) throw new NotFoundException('Modele introuvable');
    }

    const kind = dto.kind ?? template?.kind ?? 'ONBOARDING';
    const title = dto.title ?? template?.name ?? (kind === 'OFFBOARDING' ? 'Depart' : 'Arrivee');

    // Materialisation des taches depuis le modele, echeances calculees.
    const taskData = (template?.tasks ?? []).map((t) => ({
      label: t.label, description: t.description, responsible: t.responsible, order: t.order,
      dueDate: dto.startDate && t.offsetDays != null ? addDays(dto.startDate, t.offsetDays) : null,
    }));

    const journey = await this.prisma.journey.create({
      data: {
        tenantId: me.tenantId,
        employeeId: employee.id,
        templateId: template?.id ?? null,
        kind,
        title,
        startDate: dto.startDate ? new Date(dto.startDate.slice(0, 10) + 'T00:00:00.000Z') : null,
        tasks: { create: taskData },
      },
      include: { employee: employeePick, tasks: tasksOrder },
    });

    await this.notify(employee.id, 'Parcours ' + kindLabel(kind) + ' cree', title);
    return journey;
  }

  async addTask(me: JwtUser, journeyId: string, dto: AddTaskDto) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux managers');
    const journey = await this.prisma.journey.findFirst({ where: this.scope.scopedWhere(me, { id: journeyId }), select: { id: true } });
    if (!journey) throw new NotFoundException('Parcours introuvable');
    const max = await this.prisma.journeyTask.aggregate({ where: { journeyId }, _max: { order: true } });
    const task = await this.prisma.journeyTask.create({
      data: {
        journeyId, label: dto.label, description: dto.description, responsible: dto.responsible,
        dueDate: dto.dueDate ? new Date(dto.dueDate.slice(0, 10) + 'T00:00:00.000Z') : null,
        order: (max._max.order ?? -1) + 1,
      },
    });
    await this.refreshStatus(journeyId);
    return task;
  }

  async toggleTask(me: JwtUser, taskId: string, dto: ToggleTaskDto) {
    const task = await this.prisma.journeyTask.findFirst({
      where: { id: taskId, journey: this.scope.scopedWhere(me) },
      include: { journey: { select: { id: true, employeeId: true } } },
    });
    if (!task) throw new NotFoundException('Tache introuvable');
    if (!isManager(me) && task.journey.employeeId !== me.id) throw new ForbiddenException();

    await this.prisma.journeyTask.update({
      where: { id: taskId },
      data: { done: dto.done, doneAt: dto.done ? new Date() : null },
    });
    await this.refreshStatus(task.journey.id);
    return this.getOne(me, task.journey.id);
  }

  async deleteTask(me: JwtUser, taskId: string) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux managers');
    const task = await this.prisma.journeyTask.findFirst({
      where: { id: taskId, journey: this.scope.scopedWhere(me) },
      include: { journey: { select: { id: true } } },
    });
    if (!task) throw new NotFoundException('Tache introuvable');
    await this.prisma.journeyTask.delete({ where: { id: taskId } });
    await this.refreshStatus(task.journey.id);
    return { ok: true };
  }

  async cancel(me: JwtUser, id: string) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux managers');
    const journey = await this.prisma.journey.findFirst({ where: this.scope.scopedWhere(me, { id }), select: { id: true } });
    if (!journey) throw new NotFoundException('Parcours introuvable');
    return this.prisma.journey.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  // Recalcule le statut a partir des taches : toutes cochees -> COMPLETED,
  // sinon IN_PROGRESS (sans toucher a un parcours annule).
  private async refreshStatus(journeyId: string) {
    const journey = await this.prisma.journey.findUnique({ where: { id: journeyId }, select: { status: true } });
    if (!journey || journey.status === 'CANCELLED') return;
    const total = await this.prisma.journeyTask.count({ where: { journeyId } });
    const open = await this.prisma.journeyTask.count({ where: { journeyId, done: false } });
    const next = total > 0 && open === 0 ? 'COMPLETED' : 'IN_PROGRESS';
    if (next !== journey.status) {
      await this.prisma.journey.update({ where: { id: journeyId }, data: { status: next } });
    }
  }

  private async notify(userId: string, title: string, body: string) {
    await this.notifications.push({
      userId, title, body, entity: 'Journey', url: '/parcours',
    }).catch(() => {});
  }
}
