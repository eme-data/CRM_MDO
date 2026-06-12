import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { MfaService } from '../mfa/mfa.service';
import { SettingsService } from '../settings/settings.service';
import { assertStrongPassword } from '../common/validators/password.validator';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Tenant } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mfa: MfaService,
    private readonly settings: SettingsService,
  ) {}

  // Determine si l'utilisateur a une 2FA "due" : son role est dans la liste des
  // roles obligatoires (setting `auth.mfaRequiredRoles`) mais sa 2FA n'est pas
  // encore activee. Tant que ce flag est true, le MfaRequiredGuard bloque tous
  // les endpoints sauf /mfa/*, /auth/* et ceux annotes @AllowMfaPending.
  private async computeMfaPending(userId: string, role: string): Promise<boolean> {
    // Tenant de demonstration : la 2FA n'est JAMAIS forcee (elle reste possible
    // mais optionnelle). En production, elle reste obligatoire selon
    // auth.mfaRequiredRoles (defaut ADMIN,MANAGER).
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tenant: { select: { isDemo: true } } },
    });
    if (u?.tenant?.isDemo) return false;

    const requiredRolesRaw = (await this.settings.get('auth.mfaRequiredRoles')) ?? '';
    const requiredRoles = requiredRolesRaw
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);
    if (!requiredRoles.includes(role.toUpperCase())) return false;
    return !(await this.mfa.isEnabledFor(userId));
  }

  async login(
    dto: LoginDto,
    context: { ip?: string; userAgent?: string; tenant?: Tenant } = {},
  ) {
    // Multi-tenant : on cherche l'utilisateur dans le tenant resolu par le
    // domaine (le middleware TenantResolver l'a attache a req.tenant). Sans
    // tenant, on refuse — empeche un user de tenter un login sans contexte
    // valide.
    if (!context.tenant) {
      throw new UnauthorizedException('Domaine non reconnu');
    }
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, tenantId: context.tenant.id },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    // 2FA : si active sur ce compte, exiger un code TOTP valide
    const mfaEnabled = await this.mfa.isEnabledFor(user.id);
    if (mfaEnabled) {
      if (!dto.totpCode) {
        throw new UnauthorizedException('TOTP_REQUIRED');
      }
      const ok = await this.mfa.verify(user.id, dto.totpCode);
      if (!ok) throw new UnauthorizedException('Code TOTP invalide');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.prisma.activity.create({
      data: { userId: user.id, tenantId: user.tenantId, action: 'LOGIN', entity: 'User', entityId: user.id },
    });

    const mfaPending = await this.computeMfaPending(user.id, user.role);
    return this.issueTokens(
      user.id, user.email, user.role,
      user.tenantId, user.isSuperAdmin,
      mfaPending, context,
    );
  }

  async refresh(rawToken: string, context: { ip?: string; userAgent?: string } = {}) {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { token: rawToken },
      include: { user: true },
    });
    if (
      !existing ||
      existing.revokedAt ||
      existing.expiresAt < new Date() ||
      !existing.user.isActive
    ) {
      throw new UnauthorizedException('Refresh token invalide');
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });

    const mfaPending = await this.computeMfaPending(existing.user.id, existing.user.role);
    return this.issueTokens(
      existing.user.id,
      existing.user.email,
      existing.user.role,
      existing.user.tenantId,
      existing.user.isSuperAdmin,
      mfaPending,
      context,
    );
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { token: refreshToken, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const valid = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Ancien mot de passe incorrect');
    const minLength = parseInt(
      (await this.settings.get('auth.passwordMinLength')) ?? '12',
      10,
    );
    assertStrongPassword(dto.newPassword, minLength);
    const hash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  // Variante publique utilisee par le flow SSO (bypass password verif).
  // L'auth a deja ete faite par l'IdP externe ; on emet juste nos tokens.
  // mfaPending suit la meme regle qu'en login local (cf computeMfaPending).
  async issueTokensForUser(
    user: { id: string; email: string; role: string; tenantId: string | null; isSuperAdmin: boolean },
    context: { ip?: string; userAgent?: string } = {},
  ) {
    const mfaPending = await this.computeMfaPending(user.id, user.role);
    return this.issueTokens(
      user.id, user.email, user.role,
      user.tenantId, user.isSuperAdmin,
      mfaPending, context,
    );
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: string,
    tenantId: string | null,
    isSuperAdmin: boolean,
    mfaPending = false,
    context: { ip?: string; userAgent?: string } = {},
  ) {
    // tenantId et isSuperAdmin dans le payload : la JwtStrategy les valide
    // contre le tenant resolu pour le domaine courant a chaque requete.
    const accessToken = await this.jwtService.signAsync({
      sub: userId,
      email,
      role,
      tenantId,
      isSuperAdmin,
      mfaPending,
    });

    const refreshToken = randomBytes(48).toString('hex');
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn') ?? '7d';
    const expiresAt = new Date(Date.now() + this.parseDuration(refreshExpiresIn));

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt,
        ip: context.ip?.slice(0, 64),
        // Tronque le UA pour eviter les payloads malicieux et les logs verbeux
        userAgent: context.userAgent?.slice(0, 256),
        lastUsedAt: new Date(),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.configService.get<string>('jwt.expiresIn') ?? '15m',
      mfaPending,
    };
  }

  // Liste les sessions actives (refresh tokens non revoques, non expires).
  async listSessions(userId: string, currentRawToken?: string) {
    const tokens = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        token: true,
      },
    });
    return tokens.map((t) => ({
      id: t.id,
      userAgent: t.userAgent,
      ip: t.ip,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
      expiresAt: t.expiresAt,
      isCurrent: currentRawToken ? t.token === currentRawToken : false,
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count };
  }

  async revokeAllSessions(userId: string, exceptRawToken?: string) {
    const whereClause: any = { userId, revokedAt: null };
    if (exceptRawToken) whereClause.token = { not: exceptRawToken };
    const result = await this.prisma.refreshToken.updateMany({
      where: whereClause,
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count };
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 3600 * 1000;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return value * multipliers[unit];
  }
}
