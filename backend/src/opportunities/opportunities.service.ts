import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, OpportunityStage } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';

@Injectable()
export class OpportunitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    search?: string;
    stage?: OpportunityStage;
    companyId?: string;
    ownerId?: string;
  }, tenantId: string | null) {
    const where: Prisma.OpportunityWhereInput = { tenantId };
    if (params.stage) where.stage = params.stage;
    if (params.companyId) where.companyId = params.companyId;
    if (params.ownerId) where.ownerId = params.ownerId;
    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.opportunity.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
  }

  async kanban(tenantId: string | null) {
    const stages: OpportunityStage[] = [
      'QUALIFICATION',
      'PROPOSITION',
      'NEGOCIATION',
      'GAGNE',
      'PERDU',
    ];
    const results = await Promise.all(
      stages.map(async (stage) => {
        const items = await this.prisma.opportunity.findMany({
          where: { tenantId, stage },
          include: {
            company: { select: { id: true, name: true } },
            owner: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { updatedAt: 'desc' },
        });
        const totalAmount = items.reduce((sum, o) => sum + Number(o.amountHt), 0);
        return { stage, items, count: items.length, totalAmount };
      }),
    );
    return results;
  }

  async findOne(id: string, tenantId: string | null) {
    const opp = await this.prisma.opportunity.findFirst({
      where: { id, tenantId },
      include: {
        company: true,
        owner: { select: { id: true, firstName: true, lastName: true } },
        contracts: true,
      },
    });
    if (!opp) throw new NotFoundException('Opportunite introuvable');
    return opp;
  }

  async create(dto: CreateOpportunityDto, userId: string, tenantId: string | null) {
    const opp = await this.prisma.opportunity.create({
      data: {
        title: dto.title,
        stage: dto.stage,
        amountHt: dto.amountHt ?? 0,
        probability: dto.probability ?? 50,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : null,
        description: dto.description,
        companyId: dto.companyId,
        ownerId: dto.ownerId ?? userId,
        tenantId: tenantId ?? undefined,
      },
    });
    await this.prisma.activity.create({
      data: { userId, tenantId, action: 'CREATE', entity: 'Opportunity', entityId: opp.id },
    });
    return opp;
  }

  async update(id: string, dto: UpdateOpportunityDto, userId: string, tenantId: string | null) {
    await this.findOne(id, tenantId);
    const data: Prisma.OpportunityUpdateInput = { ...dto } as any;
    if (dto.expectedCloseDate) data.expectedCloseDate = new Date(dto.expectedCloseDate);
    if (dto.closedAt) data.closedAt = new Date(dto.closedAt);
    if (dto.stage === 'GAGNE' || dto.stage === 'PERDU') {
      data.closedAt = data.closedAt ?? new Date();
    }
    const updated = await this.prisma.opportunity.update({ where: { id }, data });
    await this.prisma.activity.create({
      data: { userId, tenantId, action: 'UPDATE', entity: 'Opportunity', entityId: id },
    });
    return updated;
  }

  // ============================================================
  // Win/loss analysis : aggregations sur opportunites cloturees
  // ============================================================
  async winLossAnalysis(params: { from?: string; to?: string } = {}, tenantId: string | null = null) {
    const where: Prisma.OpportunityWhereInput = {
      tenantId,
      stage: { in: ['GAGNE', 'PERDU'] },
    };
    if (params.from || params.to) {
      where.closedAt = {};
      if (params.from) (where.closedAt as any).gte = new Date(params.from);
      if (params.to) (where.closedAt as any).lte = new Date(params.to);
    }

    const opps = await this.prisma.opportunity.findMany({
      where,
      select: {
        stage: true,
        amountHt: true,
        lossReasonCode: true,
        winReasonCode: true,
        competitorName: true,
        closedAt: true,
      },
    });

    const won = opps.filter((o) => o.stage === 'GAGNE');
    const lost = opps.filter((o) => o.stage === 'PERDU');

    const winRate = opps.length > 0 ? +((won.length / opps.length) * 100).toFixed(1) : 0;
    const wonAmount = +won.reduce((s, o) => s + Number(o.amountHt), 0).toFixed(2);
    const lostAmount = +lost.reduce((s, o) => s + Number(o.amountHt), 0).toFixed(2);

    // Group lossReasonCode
    const byLossReason = new Map<string, { reason: string; count: number; amount: number }>();
    for (const o of lost) {
      const k = o.lossReasonCode ?? 'UNSPECIFIED';
      const e = byLossReason.get(k) ?? { reason: k, count: 0, amount: 0 };
      e.count += 1;
      e.amount += Number(o.amountHt);
      byLossReason.set(k, e);
    }

    // Group winReasonCode
    const byWinReason = new Map<string, { reason: string; count: number; amount: number }>();
    for (const o of won) {
      const k = o.winReasonCode ?? 'UNSPECIFIED';
      const e = byWinReason.get(k) ?? { reason: k, count: 0, amount: 0 };
      e.count += 1;
      e.amount += Number(o.amountHt);
      byWinReason.set(k, e);
    }

    // Top concurrents (uniquement sur les pertes COMPETITOR)
    const byCompetitor = new Map<string, { competitor: string; count: number; amount: number }>();
    for (const o of lost) {
      if (o.lossReasonCode !== 'COMPETITOR' || !o.competitorName) continue;
      const k = o.competitorName.trim();
      const e = byCompetitor.get(k) ?? { competitor: k, count: 0, amount: 0 };
      e.count += 1;
      e.amount += Number(o.amountHt);
      byCompetitor.set(k, e);
    }

    return {
      total: opps.length,
      won: won.length,
      lost: lost.length,
      winRatePct: winRate,
      wonAmount,
      lostAmount,
      avgDealSize: opps.length > 0 ? +(opps.reduce((s, o) => s + Number(o.amountHt), 0) / opps.length).toFixed(2) : 0,
      byLossReason: Array.from(byLossReason.values())
        .map((x) => ({ ...x, amount: +x.amount.toFixed(2) }))
        .sort((a, b) => b.count - a.count),
      byWinReason: Array.from(byWinReason.values())
        .map((x) => ({ ...x, amount: +x.amount.toFixed(2) }))
        .sort((a, b) => b.count - a.count),
      topCompetitors: Array.from(byCompetitor.values())
        .map((x) => ({ ...x, amount: +x.amount.toFixed(2) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }

  async remove(id: string, userId: string, tenantId: string | null) {
    await this.findOne(id, tenantId);
    await this.prisma.opportunity.delete({ where: { id } });
    await this.prisma.activity.create({
      data: { userId, tenantId, action: 'DELETE', entity: 'Opportunity', entityId: id },
    });
    return { success: true };
  }
}
