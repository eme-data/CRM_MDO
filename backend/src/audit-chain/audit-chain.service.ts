import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { PrismaService } from '../database/prisma.service';

// Audit trail signe via hash chaine SHA-256.
//
// Chaque Activity recoit (apres scellement) :
//   sequence    : entier monotone (commence a 1)
//   prevHash    : currentHash de l'Activity precedente (null pour seq=1)
//   currentHash : SHA256( prevHash || canonicalize(entry) )
//
// Le scellement est fait par batch toutes les 5 min (cron). Cela permet :
//  - de garder le code metier inchange (pas de wrapping de prisma.activity.create)
//  - de resister aux crash : une activity creee mais pas encore scellee sera
//    scellee au prochain run
//  - de detecter une alteration retroactive : si quelqu'un edite l'entry N
//    en BDD apres scellement, le verify recalculera et detectera le mismatch.
//
// Verification : POST /audit/verify reparcourt la chaine et signale les
// breaks (avec sequence + id). Output JSON {ok, breaks: [...]}.

export interface VerifyBreak {
  sequence: number;
  activityId: string;
  reason: string;
}

@Injectable()
export class AuditChainService {
  private readonly logger = new Logger(AuditChainService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Serialise canoniquement une entry pour le hash. Format JSON stable
  // (champs tries) — toute modification d'un champ change le hash.
  private canonicalize(entry: {
    id: string;
    userId: string;
    action: string;
    entity: string;
    entityId: string | null;
    metadata: any;
    createdAt: Date;
  }): string {
    return JSON.stringify({
      id: entry.id,
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      metadata: entry.metadata ?? null,
      createdAt: entry.createdAt.toISOString(),
    });
  }

  private computeHash(prevHash: string | null, canonical: string): string {
    return createHash('sha256').update((prevHash ?? 'GENESIS') + '|' + canonical).digest('hex');
  }

  // ============================================================
  // Sealing : scelle toutes les Activity sans currentHash, en ordre createdAt asc
  // ============================================================
  async sealPending(): Promise<{ sealed: number }> {
    const pending = await this.prisma.activity.findMany({
      where: { currentHash: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 1000,
    });
    if (pending.length === 0) return { sealed: 0 };

    // Recupere le dernier scelle pour chainage
    const last = await this.prisma.activity.findFirst({
      where: { currentHash: { not: null } },
      orderBy: { sequence: 'desc' },
      select: { currentHash: true, sequence: true },
    });
    let prevHash = last?.currentHash ?? null;
    let nextSeq = (last?.sequence ?? 0) + 1;

    for (const e of pending) {
      const canonical = this.canonicalize({
        id: e.id,
        userId: e.userId,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId,
        metadata: e.metadata,
        createdAt: e.createdAt,
      });
      const currentHash = this.computeHash(prevHash, canonical);
      await this.prisma.activity.update({
        where: { id: e.id },
        data: { prevHash, currentHash, sequence: nextSeq },
      });
      prevHash = currentHash;
      nextSeq++;
    }

    this.logger.log('Audit chain : scelle ' + pending.length + ' entries');
    return { sealed: pending.length };
  }

  // Cron 5 min — la latence max entre creation et scellement
  @Cron('*/5 * * * *', { name: 'audit-seal' })
  async runSealCron() {
    try { await this.sealPending(); }
    catch (err: any) { this.logger.error('Sealing failed : ' + err.message); }
  }

  // ============================================================
  // Verification : reparcourt la chaine scellee et detecte les breaks
  // ============================================================
  async verify(): Promise<{ ok: boolean; verified: number; breaks: VerifyBreak[] }> {
    const sealed = await this.prisma.activity.findMany({
      where: { currentHash: { not: null }, sequence: { not: null } },
      orderBy: { sequence: 'asc' },
    });
    let prevHash: string | null = null;
    const breaks: VerifyBreak[] = [];
    for (const e of sealed) {
      const canonical = this.canonicalize({
        id: e.id,
        userId: e.userId,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId,
        metadata: e.metadata,
        createdAt: e.createdAt,
      });
      const expectedHash = this.computeHash(prevHash, canonical);
      if (e.prevHash !== prevHash) {
        breaks.push({
          sequence: e.sequence!,
          activityId: e.id,
          reason: 'prevHash mismatch (expected ' + (prevHash ?? 'GENESIS') + ', got ' + (e.prevHash ?? 'null') + ')',
        });
      }
      if (e.currentHash !== expectedHash) {
        breaks.push({
          sequence: e.sequence!,
          activityId: e.id,
          reason: 'currentHash mismatch — entry alteree retroactivement',
        });
      }
      prevHash = e.currentHash;
    }
    return { ok: breaks.length === 0, verified: sealed.length, breaks };
  }

  async stats() {
    const [sealed, pending, last] = await Promise.all([
      this.prisma.activity.count({ where: { currentHash: { not: null } } }),
      this.prisma.activity.count({ where: { currentHash: null } }),
      this.prisma.activity.findFirst({
        where: { currentHash: { not: null } },
        orderBy: { sequence: 'desc' },
        select: { sequence: true, currentHash: true, createdAt: true },
      }),
    ]);
    return {
      sealed,
      pending,
      lastSequence: last?.sequence ?? null,
      lastHash: last?.currentHash ?? null,
      lastSealedAt: last?.createdAt ?? null,
    };
  }
}
