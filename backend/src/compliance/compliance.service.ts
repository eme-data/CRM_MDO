import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ComplianceControlStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { FRAMEWORK_SEEDS } from './compliance.seeds';

@Injectable()
export class ComplianceService implements OnModuleInit {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // Seed initial des frameworks (NIS2, ISO27001) au demarrage
  // ============================================================
  async onModuleInit() {
    for (const seed of FRAMEWORK_SEEDS) {
      const existing = await this.prisma.complianceFramework.findUnique({ where: { code: seed.code } });
      if (existing) continue;
      await this.prisma.complianceFramework.create({
        data: {
          code: seed.code,
          name: seed.name,
          description: seed.description,
          version: seed.version ?? '1.0',
          controls: {
            create: seed.controls.map((c, i) => ({
              code: c.code,
              title: c.title,
              description: c.description,
              category: c.category,
              criticality: c.criticality ?? 'MEDIUM',
              position: i,
            })),
          },
        },
      });
      this.logger.log('Framework seed : ' + seed.code + ' (' + seed.controls.length + ' controles)');
    }
  }

  // ============================================================
  // Frameworks (templates)
  // ============================================================
  listFrameworks(includeInactive = false) {
    return this.prisma.complianceFramework.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { _count: { select: { controls: true, assessments: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getFramework(id: string) {
    const f = await this.prisma.complianceFramework.findUnique({
      where: { id },
      include: { controls: { orderBy: { position: 'asc' } } },
    });
    if (!f) throw new NotFoundException('Framework introuvable');
    return f;
  }

  // ============================================================
  // Assessments (audits par client)
  // ============================================================
  async listAssessmentsForCompany(companyId: string) {
    return this.prisma.complianceAssessment.findMany({
      where: { companyId },
      include: {
        framework: { select: { id: true, code: true, name: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getAssessment(id: string) {
    const a = await this.prisma.complianceAssessment.findUnique({
      where: { id },
      include: {
        framework: { select: { id: true, code: true, name: true } },
        company: { select: { id: true, name: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
        controlAssessments: {
          include: { control: true, reviewedBy: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { control: { position: 'asc' } },
        },
      },
    });
    if (!a) throw new NotFoundException('Audit compliance introuvable');
    return a;
  }

  async startAssessment(companyId: string, frameworkId: string, ownerId: string | undefined, userId: string) {
    const fw = await this.prisma.complianceFramework.findUnique({
      where: { id: frameworkId },
      include: { controls: true },
    });
    if (!fw) throw new NotFoundException('Framework introuvable');

    // Verifie unicite (un seul audit par framework par societe)
    const existing = await this.prisma.complianceAssessment.findUnique({
      where: { companyId_frameworkId: { companyId, frameworkId } },
    });
    if (existing) {
      throw new BadRequestException('Audit ' + fw.code + ' deja existant pour cette societe');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const a = await tx.complianceAssessment.create({
        data: {
          companyId,
          frameworkId,
          ownerId,
          totalControls: fw.controls.length,
          notStartedCount: fw.controls.length,
          controlAssessments: {
            create: fw.controls.map((c) => ({ controlId: c.id })),
          },
        },
      });
      await tx.activity.create({
        data: {
          userId,
          action: 'COMPLIANCE_START',
          entity: 'ComplianceAssessment',
          entityId: a.id,
          metadata: { framework: fw.code, controls: fw.controls.length },
        },
      });
      return a;
    });
    return created;
  }

  async deleteAssessment(id: string, userId: string) {
    const a = await this.getAssessment(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.complianceAssessment.delete({ where: { id } });
      await tx.activity.create({
        data: {
          userId,
          action: 'COMPLIANCE_DELETE',
          entity: 'ComplianceAssessment',
          entityId: id,
          metadata: { framework: a.framework.code },
        },
      });
    });
    return { ok: true };
  }

  async updateControlAssessment(
    controlAssessmentId: string,
    update: {
      status?: ComplianceControlStatus;
      evidence?: string | null;
      evidenceUrl?: string | null;
      notes?: string | null;
      dueDate?: string | null;
    },
    userId: string,
  ) {
    const ca = await this.prisma.complianceControlAssessment.findUnique({
      where: { id: controlAssessmentId },
    });
    if (!ca) throw new NotFoundException('Controle introuvable');

    const data: Prisma.ComplianceControlAssessmentUpdateInput = {};
    if (update.status !== undefined) {
      data.status = update.status;
      data.lastReviewedAt = new Date();
      data.reviewedBy = { connect: { id: userId } };
    }
    if (update.evidence !== undefined) data.evidence = update.evidence;
    if (update.evidenceUrl !== undefined) data.evidenceUrl = update.evidenceUrl;
    if (update.notes !== undefined) data.notes = update.notes;
    if (update.dueDate !== undefined) data.dueDate = update.dueDate ? new Date(update.dueDate) : null;

    const updated = await this.prisma.complianceControlAssessment.update({
      where: { id: controlAssessmentId },
      data,
    });

    // Recalcul des compteurs + score sur l'assessment parent
    await this.recomputeAssessmentScore(ca.assessmentId);

    return updated;
  }

  // Score = (compliant / (totalControls - notApplicable)) * 100. Les NA ne
  // comptent pas dans le denominateur (un controle hors scope ne penalise pas).
  private async recomputeAssessmentScore(assessmentId: string) {
    const counts = await this.prisma.complianceControlAssessment.groupBy({
      by: ['status'],
      where: { assessmentId },
      _count: true,
    });
    const map: Record<ComplianceControlStatus, number> = {
      COMPLIANT: 0, NON_COMPLIANT: 0, IN_PROGRESS: 0, NOT_STARTED: 0, NOT_APPLICABLE: 0,
    };
    let total = 0;
    for (const c of counts) {
      map[c.status as ComplianceControlStatus] = c._count;
      total += c._count;
    }
    const denominator = total - map.NOT_APPLICABLE;
    const scorePct = denominator > 0 ? Math.round((map.COMPLIANT / denominator) * 100) : 0;
    await this.prisma.complianceAssessment.update({
      where: { id: assessmentId },
      data: {
        scorePct,
        compliantCount: map.COMPLIANT,
        nonCompliantCount: map.NON_COMPLIANT,
        inProgressCount: map.IN_PROGRESS,
        notStartedCount: map.NOT_STARTED,
        notApplicableCount: map.NOT_APPLICABLE,
        totalControls: total,
      },
    });
  }

  // Stats pour dashboard global
  async stats() {
    const [byFw, expired] = await Promise.all([
      this.prisma.complianceAssessment.groupBy({
        by: ['frameworkId'],
        _count: true,
        _avg: { scorePct: true },
      }),
      this.prisma.complianceControlAssessment.count({
        where: {
          dueDate: { lt: new Date() },
          status: { notIn: ['COMPLIANT', 'NOT_APPLICABLE'] },
        },
      }),
    ]);
    const fws = await this.prisma.complianceFramework.findMany({
      where: { id: { in: byFw.map((b) => b.frameworkId) } },
      select: { id: true, code: true, name: true },
    });
    const fwMap = new Map(fws.map((f) => [f.id, f]));
    return {
      byFramework: byFw.map((b) => ({
        framework: fwMap.get(b.frameworkId),
        assessments: b._count,
        avgScore: b._avg.scorePct ? Math.round(b._avg.scorePct) : 0,
      })),
      overdueControls: expired,
    };
  }
}
