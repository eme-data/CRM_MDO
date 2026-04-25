import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { differenceInMinutes } from 'date-fns';
import { PrismaService } from '../database/prisma.service';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';

@Injectable()
export class TimeEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  // Demarrer un timer (endedAt=null jusqu'a stop)
  async startTimer(userId: string, body: { ticketId?: string; interventionId?: string; description?: string }) {
    // Stopper d'eventuels timers en cours pour cet utilisateur
    await this.stopAllRunning(userId);
    return this.prisma.timeEntry.create({
      data: {
        userId,
        startedAt: new Date(),
        ticketId: body.ticketId,
        interventionId: body.interventionId,
        description: body.description,
      },
    });
  }

  // Stopper le timer en cours
  async stopTimer(userId: string) {
    const running = await this.prisma.timeEntry.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!running) throw new NotFoundException('Aucun timer en cours');
    const ended = new Date();
    const minutes = differenceInMinutes(ended, running.startedAt);
    return this.prisma.timeEntry.update({
      where: { id: running.id },
      data: { endedAt: ended, durationMin: minutes },
    });
  }

  async currentTimer(userId: string) {
    return this.prisma.timeEntry.findFirst({
      where: { userId, endedAt: null },
      include: {
        ticket: { select: { id: true, reference: true, title: true } },
        intervention: { select: { id: true, title: true } },
      },
    });
  }

  async create(userId: string, dto: CreateTimeEntryDto) {
    const startedAt = new Date(dto.startedAt);
    const endedAt = dto.endedAt ? new Date(dto.endedAt) : null;
    let duration = dto.durationMin;
    if (!duration && endedAt) duration = differenceInMinutes(endedAt, startedAt);
    if (!duration && !endedAt) {
      throw new BadRequestException('endedAt ou durationMin requis');
    }
    return this.prisma.timeEntry.create({
      data: {
        userId,
        startedAt,
        endedAt,
        durationMin: duration,
        description: dto.description,
        billable: dto.billable ?? true,
        ticketId: dto.ticketId,
        interventionId: dto.interventionId,
        contractId: dto.contractId,
      },
    });
  }

  async update(id: string, userId: string, dto: UpdateTimeEntryDto) {
    const existing = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    if (existing.userId !== userId) {
      throw new BadRequestException('Vous ne pouvez modifier que vos propres entrees');
    }
    const data: Prisma.TimeEntryUpdateInput = { ...dto } as any;
    if (dto.startedAt) data.startedAt = new Date(dto.startedAt);
    if (dto.endedAt) data.endedAt = new Date(dto.endedAt);
    if (dto.startedAt && dto.endedAt) {
      data.durationMin = differenceInMinutes(new Date(dto.endedAt), new Date(dto.startedAt));
    }
    return this.prisma.timeEntry.update({ where: { id }, data });
  }

  async remove(id: string, userId: string, userRole: string) {
    const existing = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    if (existing.userId !== userId && userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      throw new BadRequestException('Suppression non autorisee');
    }
    await this.prisma.timeEntry.delete({ where: { id } });
    return { success: true };
  }

  async findAll(params: {
    userId?: string;
    ticketId?: string;
    interventionId?: string;
    contractId?: string;
    from?: string;
    to?: string;
  }) {
    const where: Prisma.TimeEntryWhereInput = {};
    if (params.userId) where.userId = params.userId;
    if (params.ticketId) where.ticketId = params.ticketId;
    if (params.interventionId) where.interventionId = params.interventionId;
    if (params.contractId) where.contractId = params.contractId;
    if (params.from || params.to) {
      where.startedAt = {};
      if (params.from) (where.startedAt as any).gte = new Date(params.from);
      if (params.to) (where.startedAt as any).lte = new Date(params.to);
    }
    return this.prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        ticket: { select: { id: true, reference: true, title: true } },
        intervention: { select: { id: true, title: true } },
        contract: { select: { id: true, reference: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  // Cumuls : par utilisateur, par ticket, par client (sur une periode)
  async summary(params: { from?: string; to?: string; userId?: string }) {
    const where: Prisma.TimeEntryWhereInput = { endedAt: { not: null } };
    if (params.userId) where.userId = params.userId;
    if (params.from || params.to) {
      where.startedAt = {};
      if (params.from) (where.startedAt as any).gte = new Date(params.from);
      if (params.to) (where.startedAt as any).lte = new Date(params.to);
    }
    const entries = await this.prisma.timeEntry.findMany({
      where,
      select: {
        durationMin: true,
        billable: true,
        userId: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    const totalMin = entries.reduce((s, e) => s + (e.durationMin ?? 0), 0);
    const billableMin = entries.filter((e) => e.billable).reduce((s, e) => s + (e.durationMin ?? 0), 0);
    const byUser: Record<string, { name: string; totalMin: number; billableMin: number }> = {};
    for (const e of entries) {
      if (!byUser[e.userId]) {
        byUser[e.userId] = {
          name: e.user.firstName + ' ' + e.user.lastName,
          totalMin: 0,
          billableMin: 0,
        };
      }
      byUser[e.userId].totalMin += e.durationMin ?? 0;
      if (e.billable) byUser[e.userId].billableMin += e.durationMin ?? 0;
    }
    return {
      totalMin,
      billableMin,
      nonBillableMin: totalMin - billableMin,
      byUser: Object.entries(byUser).map(([userId, v]) => ({ userId, ...v })),
    };
  }

  private async stopAllRunning(userId: string) {
    const list = await this.prisma.timeEntry.findMany({
      where: { userId, endedAt: null },
    });
    const now = new Date();
    for (const t of list) {
      await this.prisma.timeEntry.update({
        where: { id: t.id },
        data: {
          endedAt: now,
          durationMin: differenceInMinutes(now, t.startedAt),
        },
      });
    }
  }
}
