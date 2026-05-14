import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { computeNextRunAt } from './recurring-tasks.helpers';
import {
  CreateRecurringTaskTemplateDto,
  UpdateRecurringTaskTemplateDto,
} from './dto/recurring-task-template.dto';

@Injectable()
export class RecurringTasksService {
  private readonly logger = new Logger(RecurringTasksService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // CRUD
  // ============================================================
  list() {
    return this.prisma.recurringTaskTemplate.findMany({
      include: {
        company: { select: { id: true, name: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        contract: { select: { id: true, reference: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: [{ isActive: 'desc' }, { nextRunAt: 'asc' }],
    });
  }

  async findOne(id: string) {
    const t = await this.prisma.recurringTaskTemplate.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        assignee: { select: { id: true, firstName: true, lastName: true } },
        contract: { select: { id: true, reference: true } },
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, title: true, status: true, dueDate: true, createdAt: true },
        },
      },
    });
    if (!t) throw new NotFoundException('Modele recurrent introuvable');
    return t;
  }

  async create(dto: CreateRecurringTaskTemplateDto, userId: string) {
    const startsOn = dto.startsOn ?? new Date();
    // Le premier nextRunAt = startsOn (la 1ere instance est cree au prochain
    // tick du cron suivant startsOn).
    const nextRunAt = startsOn;
    return this.prisma.recurringTaskTemplate.create({
      data: {
        name: dto.name,
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? 'NORMAL',
        dueDateOffsetDays: dto.dueDateOffsetDays ?? 7,
        frequency: dto.frequency,
        dayOfMonth: dto.dayOfMonth,
        startsOn,
        endsOn: dto.endsOn,
        nextRunAt,
        companyId: dto.companyId,
        assigneeId: dto.assigneeId,
        contractId: dto.contractId,
        createdById: userId,
      },
    });
  }

  async update(id: string, dto: UpdateRecurringTaskTemplateDto) {
    await this.findOne(id);
    // Si frequency ou dayOfMonth changent, on ne recalcule PAS nextRunAt
    // automatiquement : on laisse l'utilisateur faire un "Force run now" s'il
    // veut declencher tout de suite, sinon la prochaine generation utilisera
    // la nouvelle frequence pour calculer le tick suivant.
    return this.prisma.recurringTaskTemplate.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.recurringTaskTemplate.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Force la generation d'une instance maintenant (bouton "Run now" admin).
   * Recalcule aussi nextRunAt apres pour preserver la cadence.
   */
  async runNow(id: string) {
    const t = await this.findOne(id);
    await this.generateOneInstance(t.id);
    return this.findOne(t.id);
  }

  // ============================================================
  // Cron quotidien : execute les templates dont nextRunAt <= now
  // ============================================================
  // Tourne tous les jours a 06:30 Europe/Paris. nextRunAt est positionne a
  // 06:00 par computeNextRunAt, donc le cron arrive 30min apres pour etre
  // sur que le tick a deja passe (decalage de fuseaux DST-safe).
  @Cron('30 6 * * *', { name: 'recurring-tasks-daily', timeZone: 'Europe/Paris' })
  async runDaily() {
    const now = new Date();
    const due = await this.prisma.recurringTaskTemplate.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now },
        OR: [{ endsOn: null }, { endsOn: { gte: now } }],
      },
    });
    if (due.length === 0) {
      this.logger.log('Recurring tasks : rien a generer');
      return { generated: 0 };
    }
    this.logger.log('Recurring tasks : ' + due.length + ' template(s) a executer');
    let generated = 0;
    for (const t of due) {
      try {
        await this.generateOneInstance(t.id);
        generated++;
      } catch (err: any) {
        this.logger.warn('Generation template ' + t.id + ' echec : ' + err.message);
      }
    }
    this.logger.log('Recurring tasks : ' + generated + ' Task(s) creee(s)');
    return { generated };
  }

  /**
   * Cree UNE Task a partir du template + avance nextRunAt selon la frequence.
   * Tout en transaction pour eviter d'avancer nextRunAt sans Task creee.
   */
  private async generateOneInstance(templateId: string) {
    const t = await this.prisma.recurringTaskTemplate.findUnique({
      where: { id: templateId },
    });
    if (!t || !t.isActive) return;
    if (t.endsOn && t.endsOn < new Date()) {
      // Template expire : on desactive proprement plutot que de continuer a
      // generer. L'admin verra le toggle isActive=false dans l'UI.
      await this.prisma.recurringTaskTemplate.update({
        where: { id: t.id },
        data: { isActive: false },
      });
      return;
    }

    const now = new Date();
    const dueDate = new Date(now.getTime() + t.dueDateOffsetDays * 24 * 3600_000);
    const nextRunAt = computeNextRunAt(now, t.frequency, t.dayOfMonth);

    await this.prisma.$transaction([
      this.prisma.task.create({
        data: {
          title: t.title,
          description: t.description,
          priority: t.priority,
          dueDate,
          createdById: t.createdById,
          assigneeId: t.assigneeId,
          companyId: t.companyId,
          contractId: t.contractId,
          recurringTemplateId: t.id,
        },
      }),
      this.prisma.recurringTaskTemplate.update({
        where: { id: t.id },
        data: {
          lastRunAt: now,
          nextRunAt,
          generatedCount: { increment: 1 },
        },
      }),
    ]);
  }
}
