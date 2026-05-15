import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { ApiKeyScope, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const KEY_PREFIX_VISIBLE = 12; // chars visibles de la cle pour l'UI

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  // Format : mdo_live_<32_random_alpha_chars>
  private generate(): { full: string; prefix: string; hash: string } {
    const random = randomBytes(24).toString('base64url').slice(0, 32);
    const full = 'mdo_live_' + random;
    const prefix = full.slice(0, KEY_PREFIX_VISIBLE);
    const hash = createHash('sha256').update(full).digest('hex');
    return { full, prefix, hash };
  }

  async create(input: {
    name: string;
    scope: ApiKeyScope;
    companyId?: string;
    expiresAt?: string;
    createdById: string;
  }) {
    if ((input.scope === 'CLIENT_READ' || input.scope === 'CLIENT_WRITE') && !input.companyId) {
      throw new BadRequestException('Scope CLIENT_* requiert un companyId');
    }
    if ((input.scope === 'GLOBAL_READ' || input.scope === 'GLOBAL_WRITE') && input.companyId) {
      throw new BadRequestException('Scope GLOBAL_* ne doit pas avoir de companyId');
    }
    const { full, prefix, hash } = this.generate();
    const created = await this.prisma.apiKey.create({
      data: {
        name: input.name,
        scope: input.scope,
        keyHash: hash,
        prefix,
        companyId: input.companyId,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdById: input.createdById,
      },
    });
    // ATTENTION : la cle complete `full` est renvoyee uniquement ICI, jamais
    // re-affichable apres. Le caller doit la transmettre au client une seule fois.
    return { ...created, plaintextKey: full };
  }

  async list(params: { companyId?: string } = {}) {
    return this.prisma.apiKey.findMany({
      where: {
        ...(params.companyId ? { companyId: params.companyId } : {}),
      },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(id: string) {
    const k = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!k) throw new NotFoundException('Cle API introuvable');
    if (k.revokedAt) return k;
    return this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async verify(rawKey: string, ip?: string) {
    if (!rawKey || !rawKey.startsWith('mdo_')) return null;
    const hash = createHash('sha256').update(rawKey).digest('hex');
    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash: hash },
      include: { company: { select: { id: true, name: true } } },
    });
    if (!key) return null;
    if (key.revokedAt) throw new ForbiddenException('Cle API revoquee');
    if (key.expiresAt && key.expiresAt < new Date()) {
      throw new ForbiddenException('Cle API expiree');
    }
    // Update best-effort (non bloquant)
    this.prisma.apiKey.update({
      where: { id: key.id },
      data: {
        lastUsedAt: new Date(),
        lastUsedIp: ip ?? null,
        usageCount: { increment: 1 },
      },
    }).catch(() => {});
    return key;
  }

  isWriteScope(scope: ApiKeyScope): boolean {
    return scope === 'GLOBAL_WRITE' || scope === 'CLIENT_WRITE';
  }
  isClientScope(scope: ApiKeyScope): boolean {
    return scope === 'CLIENT_READ' || scope === 'CLIENT_WRITE';
  }
}
