import { BadRequestException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { assertStrongPassword } from '../common/validators/password.validator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private async getMinPasswordLength(): Promise<number> {
    return parseInt((await this.settings.get('auth.passwordMinLength')) ?? '12', 10);
  }

  async list() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        teamId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        teamId: true,
        team: true,
        signature: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  async updateMyProfile(userId: string, dto: { firstName?: string; lastName?: string; signature?: string | null }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        signature: true,
      },
    });
  }

  async create(dto: CreateUserDto, tenantId?: string | null) {
    // Multi-tenant : email unique PAR tenant (cf schema @@unique([tenantId, email])).
    // On verifie l'unicite scopee au tenant du createur. Sans tenantId, fallback
    // sur match global (cas du seed initial avant que les tenants existent).
    const existing = await this.prisma.user.findFirst({
      where: tenantId ? { email: dto.email, tenantId } : { email: dto.email },
    });
    if (existing) throw new ConflictException('Email deja utilise');
    assertStrongPassword(dto.password, await this.getMinPasswordLength());
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role ?? 'SALES',
        teamId: dto.teamId,
        tenantId: tenantId ?? undefined,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id);
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        teamId: true,
      },
    });
  }

  async remove(id: string, currentUserId?: string) {
    // Soft delete : on desactive plutot que supprimer physiquement.
    // Raison : User est relie a TimeEntry, ownedCompanies, ownedContracts,
    // assignedTickets, etc. via Cascade. Un DELETE physique ferait perdre
    // toutes les heures saisies (impact direct sur la facturation au temps
    // passe) et orphelinerait l'historique. La desactivation conserve la
    // tracabilite et empeche le login (cf JwtStrategy isActive).
    if (currentUserId && currentUserId === id) {
      throw new BadRequestException('Vous ne pouvez pas vous desactiver vous-meme.');
    }
    const target = await this.findById(id);
    if (target.role === 'ADMIN') {
      const activeAdmins = await this.prisma.user.count({
        where: { role: 'ADMIN', isActive: true, id: { not: id } },
      });
      if (activeAdmins === 0) {
        throw new BadRequestException('Impossible de desactiver le dernier ADMIN actif.');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { isActive: false } });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    return { success: true };
  }

  async resetPassword(id: string, newPassword: string) {
    await this.findById(id);
    assertStrongPassword(newPassword, await this.getMinPasswordLength());
    const hash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: hash },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }
}
