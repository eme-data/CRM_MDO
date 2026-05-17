import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash, randomBytes } from 'crypto';
import { BackupRunStatus, BackupSourceType, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ============================================================
  // Jobs CRUD
  // ============================================================
  list(params: { companyId?: string } = {}) {
    return this.prisma.backupJob.findMany({
      where: params.companyId ? { companyId: params.companyId } : {},
      include: { company: { select: { id: true, name: true } } },
      orderBy: [{ isActive: 'desc' }, { lastSuccessAt: 'asc' }],
    });
  }

  async findOne(id: string) {
    const j = await this.prisma.backupJob.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        runs: { orderBy: { startedAt: 'desc' }, take: 30 },
      },
    });
    if (!j) throw new NotFoundException('Job introuvable');
    return j;
  }

  async create(input: {
    companyId: string;
    name: string;
    vendor?: string;
    sourceType?: BackupSourceType;
    sourceIdentifier?: string;
    expectedFrequencyHours?: number;
  }) {
    // Genere un secret webhook qu'on retournera UNE FOIS au caller. On ne
    // stocke que le hash pour eviter de l'exposer en cas de fuite BDD.
    const plainSecret = 'mdobk_' + randomBytes(24).toString('base64url');
    const secretHash = createHash('sha256').update(plainSecret).digest('hex');
    const created = await this.prisma.backupJob.create({
      data: {
        companyId: input.companyId,
        name: input.name,
        vendor: input.vendor,
        sourceType: input.sourceType ?? 'OTHER',
        sourceIdentifier: input.sourceIdentifier,
        expectedFrequencyHours: input.expectedFrequencyHours ?? 26,
        ingestSecret: secretHash,
      },
    });
    return { ...created, plaintextSecret: plainSecret };
  }

  async update(id: string, input: {
    name?: string;
    vendor?: string | null;
    sourceType?: BackupSourceType;
    sourceIdentifier?: string | null;
    expectedFrequencyHours?: number;
    isActive?: boolean;
  }) {
    await this.findOne(id);
    return this.prisma.backupJob.update({ where: { id }, data: input });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.backupJob.delete({ where: { id } });
    return { ok: true };
  }

  // ============================================================
  // Runs : ingestion
  // ============================================================
  async recordRun(jobId: string, run: {
    status: BackupRunStatus;
    startedAt: string | Date;
    endedAt?: string | Date;
    durationSec?: number;
    sizeBytes?: number | bigint;
    itemsCount?: number;
    message?: string;
    externalRunId?: string;
    rawPayload?: any;
  }) {
    const job = await this.findOne(jobId);
    const startedAt = typeof run.startedAt === 'string' ? new Date(run.startedAt) : run.startedAt;
    const endedAt = run.endedAt ? (typeof run.endedAt === 'string' ? new Date(run.endedAt) : run.endedAt) : null;

    // Upsert sur (jobId, externalRunId) si fourni — evite doublons webhook
    const created = run.externalRunId
      ? await this.prisma.backupRun.upsert({
          where: { jobId_externalRunId: { jobId, externalRunId: run.externalRunId } },
          create: {
            jobId,
            status: run.status,
            startedAt,
            endedAt,
            durationSec: run.durationSec,
            sizeBytes: run.sizeBytes != null ? BigInt(run.sizeBytes as any) : null,
            itemsCount: run.itemsCount,
            message: run.message,
            externalRunId: run.externalRunId,
            rawPayload: run.rawPayload as any,
          },
          update: {
            status: run.status,
            endedAt,
            durationSec: run.durationSec,
            sizeBytes: run.sizeBytes != null ? BigInt(run.sizeBytes as any) : null,
            itemsCount: run.itemsCount,
            message: run.message,
            rawPayload: run.rawPayload as any,
          },
        })
      : await this.prisma.backupRun.create({
          data: {
            jobId,
            status: run.status,
            startedAt,
            endedAt,
            durationSec: run.durationSec,
            sizeBytes: run.sizeBytes != null ? BigInt(run.sizeBytes as any) : null,
            itemsCount: run.itemsCount,
            message: run.message,
            rawPayload: run.rawPayload as any,
          },
        });

    // Update miroirs sur le job
    await this.prisma.backupJob.update({
      where: { id: jobId },
      data: {
        lastRunStatus: run.status,
        lastRunAt: startedAt,
        ...(run.status === 'SUCCESS'
          ? { lastSuccessAt: startedAt, lastSuccessSizeBytes: run.sizeBytes != null ? BigInt(run.sizeBytes as any) : null }
          : {}),
      },
    });

    return created;
  }

  // Ingestion via webhook avec secret. Le secret en clair est passe dans
  // l'URL ou un header — on hash et on compare au stocke.
  async ingestViaSecret(jobId: string, secretPlain: string, run: any) {
    const job = await this.prisma.backupJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job introuvable');
    if (!job.ingestSecret) throw new BadRequestException('Job sans secret');
    const hash = createHash('sha256').update(secretPlain).digest('hex');
    if (hash !== job.ingestSecret) throw new BadRequestException('Secret invalide');
    return this.recordRun(jobId, run);
  }

  // ============================================================
  // Cron : alerte pour les jobs en retard (no SUCCESS dans la fenetre)
  // 06:00 Europe/Paris (apres le passage de la nuit)
  // ============================================================
  @Cron('0 6 * * *', { name: 'backup-overdue-check', timeZone: 'Europe/Paris' })
  async runOverdueCheck() {
    // Try-catch root : une exception non geree (DB indispo, push notif KO)
    // crash le scheduler @nestjs/schedule et empeche les autres crons de
    // tourner. On log et on continue silencieusement.
    try {
      const now = Date.now();
      const jobs = await this.prisma.backupJob.findMany({
        where: { isActive: true },
        include: { company: { select: { id: true, name: true, ownerId: true } } },
      });
      let alerted = 0;
      for (const j of jobs) {
        const windowMs = j.expectedFrequencyHours * 3600_000;
        const lastOk = j.lastSuccessAt?.getTime() ?? 0;
        if (now - lastOk > windowMs) {
          // Notifier l'owner du client (et ADMIN par defaut si pas d'owner)
          const recipientId = j.company.ownerId;
          if (recipientId) {
            try {
              await this.notifications.push({
                userId: recipientId,
                type: 'GENERIC',
                title: 'Backup en retard : ' + j.name,
                body: 'Aucun SUCCESS depuis ' + (j.lastSuccessAt?.toISOString().slice(0, 16) ?? 'jamais') + ' (' + j.company.name + ')',
                entity: 'BackupJob',
                entityId: j.id,
                url: '/backups/' + j.id,
              });
              alerted++;
            } catch (notifErr: any) {
              // Une notif KO ne doit pas stopper les autres
              this.logger.warn('Backup overdue : notif KO pour job ' + j.id + ' : ' + notifErr.message);
            }
          }
        }
      }
      if (alerted > 0) this.logger.warn('Backup overdue cron : ' + alerted + ' alerte(s) envoyee(s)');
    } catch (err: any) {
      this.logger.error('Backup overdue cron a echoue : ' + (err?.message ?? err));
    }
  }

  // ============================================================
  // Stats globales
  // ============================================================
  async stats() {
    const jobs = await this.prisma.backupJob.findMany({
      where: { isActive: true },
      select: { lastRunStatus: true, lastSuccessAt: true, expectedFrequencyHours: true },
    });
    const now = Date.now();
    let success = 0, failed = 0, overdue = 0, never = 0;
    for (const j of jobs) {
      if (!j.lastSuccessAt) { never++; continue; }
      const windowMs = j.expectedFrequencyHours * 3600_000;
      if (now - j.lastSuccessAt.getTime() > windowMs) overdue++;
      if (j.lastRunStatus === 'SUCCESS') success++;
      else if (j.lastRunStatus === 'FAILED') failed++;
    }
    return {
      total: jobs.length,
      success,
      failed,
      overdue,
      neverSucceeded: never,
      successPct: jobs.length > 0 ? Math.round((success / jobs.length) * 100) : 0,
    };
  }
}
