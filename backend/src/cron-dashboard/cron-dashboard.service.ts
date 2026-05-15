import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../database/prisma.service';

export interface CronJobInfo {
  name: string;
  cronExpression: string;
  timeZone: string | null;
  running: boolean;
  nextDateAt: string | null;
  lastDateAt: string | null;
}

@Injectable()
export class CronDashboardService {
  private readonly logger = new Logger(CronDashboardService.name);

  constructor(
    private readonly scheduler: SchedulerRegistry,
    private readonly prisma: PrismaService,
  ) {}

  // ============================================================
  // List all registered crons via SchedulerRegistry
  // ============================================================
  list(): CronJobInfo[] {
    const map = this.scheduler.getCronJobs();
    const items: CronJobInfo[] = [];
    map.forEach((job: CronJob, name: string) => {
      items.push({
        name,
        cronExpression: (job as any).cronTime?.source ?? 'inconnu',
        timeZone: (job as any).cronTime?.timeZone ?? null,
        running: job.running ?? false,
        nextDateAt: job.running ? job.nextDate?.()?.toISO?.() ?? null : null,
        lastDateAt: (job as any).lastDate?.()?.toISO?.() ?? null,
      });
    });
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ============================================================
  // Trigger a cron NOW (sans attendre la prochaine occurrence)
  // ============================================================
  async runNow(name: string, userId: string) {
    const map = this.scheduler.getCronJobs();
    const job = map.get(name);
    if (!job) throw new NotFoundException('Cron "' + name + '" introuvable');
    // Trace dans Activity pour audit
    await this.prisma.activity.create({
      data: {
        userId,
        action: 'CRON_TRIGGER_MANUAL',
        entity: 'CronJob',
        entityId: name,
        metadata: { triggeredAt: new Date().toISOString() },
      },
    }).catch(() => {});
    // fireOnTick execute la callback enregistree
    try {
      const cb = (job as any)._callbacks?.[0] ?? (job as any).fireOnTick;
      if (typeof cb === 'function') {
        // CronJob a un fireOnTick interne — best-effort
        await Promise.resolve(cb()).catch((e: any) => { throw e; });
      } else {
        throw new Error('Impossible de declencher le cron — callback introuvable');
      }
      return { ok: true, name };
    } catch (err: any) {
      this.logger.warn('Cron ' + name + ' run failed : ' + err.message);
      throw new BadRequestException('Execution echouee : ' + err.message);
    }
  }

  // ============================================================
  // History : les triggers manuels + les CronJob d'execution metier
  // qui se sont logges via Activity (workflow runs, recurring tasks, etc.)
  // ============================================================
  async history(name?: string, limit = 50) {
    return this.prisma.activity.findMany({
      where: {
        action: { in: ['CRON_TRIGGER_MANUAL'] },
        ...(name ? { entityId: name } : {}),
      },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
