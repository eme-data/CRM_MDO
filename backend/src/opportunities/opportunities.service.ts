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
  }) {
    const where: Prisma.OpportunityWhereInput = {};
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
    });
  }

  async kanban() {
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
          where: { stage },
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

  async findOne(id: string) {
    const opp = await this.prisma.opportunity.findUnique({
      where: { id },
      include: {
        company: true,
        owner: { select: { id: true, firstName: true, lastName: true } },
        contracts: true,
      },
    });
    if (!opp) throw new NotFoundException('Opportunite introuvable');
    return opp;
  }

  async create(dto: CreateOpportunityDto, userId: string) {
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
      },
    });
    await this.prisma.activity.create({
      data: { userId, action: 'CREATE', entity: 'Opportunity', entityId: opp.id },
    });
    return opp;
  }

  async update(id: string, dto: UpdateOpportunityDto, userId: string) {
    await this.findOne(id);
    const data: Prisma.OpportunityUpdateInput = { ...dto } as any;
    if (dto.expectedCloseDate) data.expectedCloseDate = new Date(dto.expectedCloseDate);
    if (dto.closedAt) data.closedAt = new Date(dto.closedAt);
    if (dto.stage === 'GAGNE' || dto.stage === 'PERDU') {
      data.closedAt = data.closedAt ?? new Date();
    }
    const updated = await this.prisma.opportunity.update({ where: { id }, data });
    await this.prisma.activity.create({
      data: { userId, action: 'UPDATE', entity: 'Opportunity', entityId: id },
    });
    return updated;
  }

  async remove(id: string, userId: string) {
    await this.findOne(id);
    await this.prisma.opportunity.delete({ where: { id } });
    await this.prisma.activity.create({
      data: { userId, action: 'DELETE', entity: 'Opportunity', entityId: id },
    });
    return { success: true };
  }
}
