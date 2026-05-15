import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ContractOffer, OnboardingStepStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // Templates
  // ============================================================
  listTemplates(includeInactive = false) {
    return this.prisma.onboardingTemplate.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        _count: { select: { steps: true, runs: true } },
        steps: { orderBy: { position: 'asc' } },
      },
      orderBy: [{ offer: 'asc' }, { name: 'asc' }],
    });
  }

  async findTemplate(id: string) {
    const t = await this.prisma.onboardingTemplate.findUnique({
      where: { id },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
    if (!t) throw new NotFoundException('Template introuvable');
    return t;
  }

  async createTemplate(input: {
    name: string;
    description?: string;
    offer?: ContractOffer | null;
    steps: Array<{ title: string; description?: string; dueDateOffsetDays?: number; assigneeRole?: Role }>;
  }) {
    return this.prisma.onboardingTemplate.create({
      data: {
        name: input.name,
        description: input.description,
        offer: input.offer ?? null,
        steps: {
          create: input.steps.map((s, i) => ({
            position: i,
            title: s.title,
            description: s.description,
            dueDateOffsetDays: s.dueDateOffsetDays ?? i * 3,
            assigneeRole: s.assigneeRole,
          })),
        },
      },
      include: { steps: true },
    });
  }

  async updateTemplate(id: string, input: {
    name?: string;
    description?: string | null;
    offer?: ContractOffer | null;
    isActive?: boolean;
    steps?: Array<{ title: string; description?: string; dueDateOffsetDays?: number; assigneeRole?: Role }>;
  }) {
    await this.findTemplate(id);
    const data: Prisma.OnboardingTemplateUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.offer !== undefined) data.offer = input.offer;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    return this.prisma.$transaction(async (tx) => {
      if (input.steps) {
        await tx.onboardingTemplateStep.deleteMany({ where: { templateId: id } });
        await tx.onboardingTemplateStep.createMany({
          data: input.steps.map((s, i) => ({
            templateId: id,
            position: i,
            title: s.title,
            description: s.description,
            dueDateOffsetDays: s.dueDateOffsetDays ?? i * 3,
            assigneeRole: s.assigneeRole,
          })),
        });
      }
      return tx.onboardingTemplate.update({ where: { id }, data, include: { steps: true } });
    });
  }

  async removeTemplate(id: string) {
    const t = await this.prisma.onboardingTemplate.findUnique({
      where: { id },
      include: { _count: { select: { runs: true } } },
    });
    if (!t) throw new NotFoundException('Template introuvable');
    if (t._count.runs > 0) {
      throw new BadRequestException(
        'Template utilise par ' + t._count.runs + ' run(s). Desactivez-le plutot que de le supprimer.',
      );
    }
    await this.prisma.onboardingTemplate.delete({ where: { id } });
    return { ok: true };
  }

  // ============================================================
  // Runs (instances)
  // ============================================================
  listRuns(params: { companyId?: string; status?: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' } = {}) {
    return this.prisma.onboardingRun.findMany({
      where: {
        ...(params.companyId ? { companyId: params.companyId } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      include: {
        company: { select: { id: true, name: true } },
        contract: { select: { id: true, reference: true, offer: true } },
        template: { select: { id: true, name: true } },
      },
      orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
    });
  }

  async findRun(id: string) {
    const r = await this.prisma.onboardingRun.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        contract: { select: { id: true, reference: true, offer: true } },
        template: { select: { id: true, name: true } },
        steps: {
          include: {
            assignee: { select: { id: true, firstName: true, lastName: true } },
            doneBy: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!r) throw new NotFoundException('Onboarding introuvable');
    return r;
  }

  // Demarre un onboarding pour un contrat. Idempotent : si un run existe deja
  // pour ce contrat, on le retourne au lieu d'en creer un nouveau.
  async startForContract(contractId: string, templateId?: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('Contrat introuvable');

    const existing = await this.prisma.onboardingRun.findUnique({ where: { contractId } });
    if (existing) return existing;

    // Resolution du template : explicite, sinon par offre (active), sinon
    // global actif. Si rien : pas d'auto-onboarding (c'est OK).
    let template;
    if (templateId) {
      template = await this.prisma.onboardingTemplate.findUnique({
        where: { id: templateId },
        include: { steps: { orderBy: { position: 'asc' } } },
      });
    } else {
      template =
        (await this.prisma.onboardingTemplate.findFirst({
          where: { isActive: true, offer: contract.offer },
          include: { steps: { orderBy: { position: 'asc' } } },
        })) ??
        (await this.prisma.onboardingTemplate.findFirst({
          where: { isActive: true, offer: null },
          include: { steps: { orderBy: { position: 'asc' } } },
        }));
    }
    if (!template) {
      throw new BadRequestException(
        'Aucun template d\'onboarding actif ne correspond a l\'offre ' + contract.offer +
        '. Creez-en un dans /admin/onboarding-templates.',
      );
    }

    // Resolution des assignees par role (premier user actif du role)
    const roleAssignees = new Map<Role, string | null>();
    const rolesNeeded: Role[] = Array.from(
      new Set(template.steps.map((s) => s.assigneeRole).filter((r): r is Role => !!r)),
    );
    for (const role of rolesNeeded) {
      const u = await this.prisma.user.findFirst({
        where: { role: role as Role, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      roleAssignees.set(role, u?.id ?? null);
    }

    const startedAt = new Date();
    return this.prisma.onboardingRun.create({
      data: {
        templateId: template.id,
        contractId,
        companyId: contract.companyId,
        startedAt,
        totalSteps: template.steps.length,
        steps: {
          create: template.steps.map((s) => ({
            position: s.position,
            title: s.title,
            description: s.description,
            dueDate: new Date(startedAt.getTime() + s.dueDateOffsetDays * 86400_000),
            assigneeId: s.assigneeRole ? roleAssignees.get(s.assigneeRole) ?? undefined : undefined,
          })),
        },
      },
    });
  }

  async cancelRun(id: string) {
    await this.findRun(id);
    return this.prisma.onboardingRun.update({
      where: { id },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
  }

  // ============================================================
  // Steps
  // ============================================================
  async updateStep(id: string, input: {
    status?: OnboardingStepStatus;
    assigneeId?: string | null;
    notes?: string | null;
    dueDate?: string | null;
  }, userId: string) {
    const step = await this.prisma.onboardingRunStep.findUnique({ where: { id } });
    if (!step) throw new NotFoundException('Etape introuvable');

    const data: Prisma.OnboardingRunStepUpdateInput = {};
    if (input.status !== undefined) {
      data.status = input.status;
      if (input.status === 'DONE') {
        data.doneAt = new Date();
        data.doneBy = { connect: { id: userId } };
      } else if (input.status === 'PENDING' || input.status === 'IN_PROGRESS') {
        data.doneAt = null;
        data.doneBy = { disconnect: true };
      }
    }
    if (input.assigneeId !== undefined) {
      data.assignee = input.assigneeId
        ? { connect: { id: input.assigneeId } }
        : { disconnect: true };
    }
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;

    const updated = await this.prisma.onboardingRunStep.update({ where: { id }, data });
    await this.recomputeCounts(step.runId);
    return updated;
  }

  private async recomputeCounts(runId: string) {
    const counts = await this.prisma.onboardingRunStep.groupBy({
      by: ['status'],
      where: { runId },
      _count: true,
    });
    let done = 0, skipped = 0, total = 0;
    for (const c of counts) {
      total += c._count;
      if (c.status === 'DONE') done = c._count;
      else if (c.status === 'SKIPPED') skipped = c._count;
    }
    const allCompleted = (done + skipped) === total && total > 0;
    await this.prisma.onboardingRun.update({
      where: { id: runId },
      data: {
        doneSteps: done,
        skippedSteps: skipped,
        totalSteps: total,
        ...(allCompleted ? { status: 'COMPLETED', completedAt: new Date() } : {}),
      },
    });
  }
}
