import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SkillLevel } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // Catalogue Skills
  // ============================================================
  listSkills(includeInactive = false) {
    return this.prisma.skill.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { _count: { select: { userSkills: true } } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async createSkill(input: {
    code: string;
    name: string;
    category?: string;
    provider?: string;
    validityMonths?: number;
    description?: string;
  }) {
    return this.prisma.skill.create({ data: input });
  }

  async updateSkill(id: string, input: Partial<Prisma.SkillUpdateInput>) {
    return this.prisma.skill.update({ where: { id }, data: input });
  }

  async removeSkill(id: string) {
    await this.prisma.skill.delete({ where: { id } });
    return { ok: true };
  }

  // ============================================================
  // UserSkills
  // ============================================================
  async upsertUserSkill(input: {
    userId: string;
    skillId: string;
    level?: SkillLevel;
    certifiedAt?: string | null;
    expiresAt?: string | null;
    certificateUrl?: string | null;
    notes?: string | null;
  }) {
    // Si pas d'expiresAt mais validityMonths defini sur le skill,
    // on calcule l'expiration automatiquement (certifiedAt + validityMonths).
    let expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (!expiresAt && input.certifiedAt) {
      const skill = await this.prisma.skill.findUnique({ where: { id: input.skillId } });
      if (skill?.validityMonths) {
        const cert = new Date(input.certifiedAt);
        expiresAt = new Date(cert.getTime() + skill.validityMonths * 30 * 86400_000);
      }
    }
    return this.prisma.userSkill.upsert({
      where: { userId_skillId: { userId: input.userId, skillId: input.skillId } },
      create: {
        userId: input.userId,
        skillId: input.skillId,
        level: input.level ?? 'INTERMEDIATE',
        certifiedAt: input.certifiedAt ? new Date(input.certifiedAt) : null,
        expiresAt,
        certificateUrl: input.certificateUrl,
        notes: input.notes,
      },
      update: {
        level: input.level ?? undefined,
        certifiedAt: input.certifiedAt !== undefined ? (input.certifiedAt ? new Date(input.certifiedAt) : null) : undefined,
        expiresAt: input.expiresAt !== undefined ? expiresAt : undefined,
        certificateUrl: input.certificateUrl,
        notes: input.notes,
      },
    });
  }

  async removeUserSkill(id: string) {
    await this.prisma.userSkill.delete({ where: { id } });
    return { ok: true };
  }

  async listForUser(userId: string, tenantId: string | null) {
    return this.prisma.userSkill.findMany({
      // Scope tenant via la relation user : on ne liste pas les certifs d'un
      // utilisateur appartenant a un autre tenant.
      where: { userId, user: tenantId ? { tenantId } : undefined },
      include: { skill: true },
      orderBy: { skill: { category: 'asc' } },
    });
  }

  // ============================================================
  // Matrice (vue pivot user × skill)
  // ============================================================
  async matrix(tenantId: string | null) {
    const userWhere = { isActive: true, ...(tenantId ? { tenantId } : {}) };
    const [users, skills, userSkills] = await Promise.all([
      this.prisma.user.findMany({
        where: userWhere,
        select: { id: true, firstName: true, lastName: true, role: true },
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.skill.findMany({
        where: { isActive: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.userSkill.findMany({
        // Scope tenant via la relation user (UserSkill n'a pas de tenantId direct).
        where: tenantId ? { user: { tenantId } } : undefined,
        select: { userId: true, skillId: true, level: true, certifiedAt: true, expiresAt: true, certificateUrl: true },
      }),
    ]);
    // Pivot : { [userId]: { [skillId]: { level, expiresAt, ... } } }
    const pivot: Record<string, Record<string, any>> = {};
    for (const u of users) pivot[u.id] = {};
    for (const us of userSkills) {
      if (!pivot[us.userId]) continue;
      pivot[us.userId][us.skillId] = us;
    }
    return { users, skills, pivot };
  }

  // Certifs qui expirent bientot (J+90)
  async expiringSoon(tenantId: string | null, days = 90) {
    const limit = new Date(Date.now() + days * 86400_000);
    return this.prisma.userSkill.findMany({
      where: {
        expiresAt: { gte: new Date(), lte: limit },
        // Scope tenant via la relation user.
        ...(tenantId ? { user: { tenantId } } : {}),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        skill: { select: { id: true, name: true, code: true, provider: true } },
      },
      orderBy: { expiresAt: 'asc' },
    });
  }
}
