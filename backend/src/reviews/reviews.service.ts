import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ObjectiveStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { CreateObjectiveDto } from './dto/create-objective.dto';
import { UpdateObjectiveDto } from './dto/update-objective.dto';

// SIRH - Entretiens & objectifs.
//   - Entretien (Review) entre un collaborateur et son manager : notes de
//     preparation separees + compte-rendu partage + statut.
//   - Objectifs (Objective) individuels, rattachables a un entretien.
// Manager = ADMIN/MANAGER/super-admin. Le collaborateur ne voit/edite que
// SES entretiens (sa preparation) et ses objectifs (avancement).

function isManager(me: JwtUser): boolean {
  return me.isSuperAdmin || me.role === 'ADMIN' || me.role === 'MANAGER';
}

const userPick = { select: { id: true, firstName: true, lastName: true } };

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------- Entretiens ----------

  async listMine(me: JwtUser) {
    return this.prisma.review.findMany({
      where: { employeeId: me.id },
      include: { manager: userPick, objectives: true },
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  // Vue manager : tous les entretiens du tenant.
  async listManaged(me: JwtUser) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux managers');
    return this.prisma.review.findMany({
      where: this.scope.scopedWhere(me),
      include: { employee: userPick, manager: userPick, objectives: true },
      orderBy: [{ status: 'asc' }, { scheduledAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async getOne(me: JwtUser, id: string) {
    const review = await this.prisma.review.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: { employee: userPick, manager: userPick, objectives: { orderBy: { createdAt: 'asc' } } },
    });
    if (!review) throw new NotFoundException('Entretien introuvable');
    if (!isManager(me) && review.employeeId !== me.id) throw new ForbiddenException();
    return review;
  }

  async create(me: JwtUser, dto: CreateReviewDto) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux managers');
    const employee = await this.prisma.user.findFirst({
      where: this.scope.scopedWhere(me, { id: dto.employeeId }),
      select: { id: true, firstName: true, lastName: true },
    });
    if (!employee) throw new NotFoundException('Collaborateur introuvable');

    const review = await this.prisma.review.create({
      data: {
        tenantId: me.tenantId,
        employeeId: employee.id,
        managerId: me.id,
        type: dto.type ?? 'ANNUAL',
        status: 'SCHEDULED',
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        managerNotes: dto.managerNotes,
      },
    });
    await this.notify(employee.id, 'Entretien planifie',
      'Un entretien ' + this.typeLabel(review.type) + ' a ete planifie.', review.id);
    return review;
  }

  async update(me: JwtUser, id: string, dto: UpdateReviewDto) {
    const review = await this.prisma.review.findFirst({ where: this.scope.scopedWhere(me, { id }) });
    if (!review) throw new NotFoundException('Entretien introuvable');

    const isEmployee = review.employeeId === me.id;
    const canManage = isManager(me);
    if (!isEmployee && !canManage) throw new ForbiddenException();

    const data: any = {};
    // Le collaborateur ne peut toucher QUE sa preparation.
    if (dto.employeeNotes !== undefined) {
      if (!isEmployee) throw new ForbiddenException('employeeNotes reserve au collaborateur');
      data.employeeNotes = dto.employeeNotes;
    }
    // Champs reserves au manager.
    const managerFields = ['managerNotes', 'summary', 'status', 'type', 'rating'] as const;
    if (managerFields.some((f) => (dto as any)[f] !== undefined) || dto.scheduledAt !== undefined) {
      if (!canManage) throw new ForbiddenException('Modification reservee au manager');
      if (dto.managerNotes !== undefined) data.managerNotes = dto.managerNotes;
      if (dto.summary !== undefined) data.summary = dto.summary;
      if (dto.type !== undefined) data.type = dto.type;
      if (dto.rating !== undefined) data.rating = dto.rating;
      if (dto.scheduledAt !== undefined) data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
      if (dto.status !== undefined) {
        data.status = dto.status;
        if (dto.status === 'COMPLETED') data.completedAt = new Date();
      }
    }
    if (Object.keys(data).length === 0) throw new BadRequestException('Rien a mettre a jour');

    const updated = await this.prisma.review.update({ where: { id }, data });
    // Notifs croisees lors d'evenements cles.
    if (data.status === 'COMPLETED') {
      await this.notify(review.employeeId, 'Entretien realise', 'Le compte-rendu de votre entretien est disponible.', id);
    } else if (isEmployee && data.employeeNotes !== undefined) {
      await this.notify(review.managerId, 'Preparation collaborateur', 'Le collaborateur a complete sa preparation d\'entretien.', id);
    }
    return updated;
  }

  // ---------- Objectifs ----------

  async listMyObjectives(me: JwtUser) {
    return this.prisma.objective.findMany({
      where: { userId: me.id },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async listObjectivesFor(me: JwtUser, userId: string) {
    if (!isManager(me) && userId !== me.id) throw new ForbiddenException();
    return this.prisma.objective.findMany({
      where: this.scope.scopedWhere(me, { userId }),
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createObjective(me: JwtUser, dto: CreateObjectiveDto) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux managers');
    const target = await this.prisma.user.findFirst({
      where: this.scope.scopedWhere(me, { id: dto.userId }),
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Collaborateur introuvable');
    if (dto.reviewId) {
      const rev = await this.prisma.review.findFirst({ where: this.scope.scopedWhere(me, { id: dto.reviewId }), select: { id: true } });
      if (!rev) throw new NotFoundException('Entretien introuvable');
    }
    const obj = await this.prisma.objective.create({
      data: {
        tenantId: me.tenantId,
        userId: target.id,
        reviewId: dto.reviewId ?? null,
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      },
    });
    await this.notify(target.id, 'Nouvel objectif', dto.title, dto.reviewId);
    return obj;
  }

  async updateObjective(me: JwtUser, id: string, dto: UpdateObjectiveDto) {
    const obj = await this.prisma.objective.findFirst({ where: this.scope.scopedWhere(me, { id }) });
    if (!obj) throw new NotFoundException('Objectif introuvable');
    const isOwner = obj.userId === me.id;
    if (!isOwner && !isManager(me)) throw new ForbiddenException();

    const data: any = {};
    // Le proprietaire peut faire avancer (progress/status) ; le manager peut tout.
    if (dto.progress !== undefined) {
      data.progress = dto.progress;
      if (dto.progress >= 100 && dto.status === undefined) data.status = ObjectiveStatus.DONE;
    }
    if (dto.status !== undefined) data.status = dto.status;
    if (isManager(me)) {
      if (dto.title !== undefined) data.title = dto.title;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    } else if (dto.title !== undefined || dto.description !== undefined || dto.dueDate !== undefined) {
      throw new ForbiddenException('Seul le manager peut modifier le libelle de l\'objectif');
    }
    if (Object.keys(data).length === 0) throw new BadRequestException('Rien a mettre a jour');
    return this.prisma.objective.update({ where: { id }, data });
  }

  async deleteObjective(me: JwtUser, id: string) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux managers');
    const obj = await this.prisma.objective.findFirst({ where: this.scope.scopedWhere(me, { id }), select: { id: true } });
    if (!obj) throw new NotFoundException('Objectif introuvable');
    await this.prisma.objective.delete({ where: { id } });
    return { ok: true };
  }

  // ---------- utils ----------

  private typeLabel(t: string): string {
    return ({ ANNUAL: 'annuel', PROFESSIONAL: 'professionnel', PROBATION: 'de periode d\'essai', ONE_ON_ONE: 'individuel' } as Record<string, string>)[t] ?? '';
  }

  private async notify(userId: string, title: string, body: string, reviewId?: string) {
    await this.notifications.push({
      userId, title, body,
      entity: 'Review', entityId: reviewId, url: '/entretiens',
    }).catch(() => {});
  }
}
