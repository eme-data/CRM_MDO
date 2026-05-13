import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../database/prisma.service';
import { MfaService } from '../mfa/mfa.service';
import { SettingsService } from '../settings/settings.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: jest.Mocked<any>;
  let mfa: jest.Mocked<MfaService>;
  let settings: jest.Mocked<SettingsService>;
  let jwt: jest.Mocked<JwtService>;

  const validHash = bcrypt.hashSync('CorrectHorse42!Battery', 4);

  const baseUser = {
    id: 'user-1',
    email: 'mathieu@mdoservices.fr',
    role: 'ADMIN' as const,
    isActive: true,
    passwordHash: validHash,
    firstName: 'Mathieu',
    lastName: 'D',
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      activity: { create: jest.fn() },
    };
    mfa = {
      isEnabledFor: jest.fn().mockResolvedValue(false),
      verify: jest.fn().mockResolvedValue(true),
    } as any;
    settings = {
      get: jest.fn().mockResolvedValue(''),
    } as any;
    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-access-token'),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('15m') },
        },
        { provide: MfaService, useValue: mfa },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('rejette un email inconnu', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nope@x.fr', password: 'whatever' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejette un utilisateur desactive', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: false });
      await expect(
        service.login({ email: baseUser.email, password: 'CorrectHorse42!Battery' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejette un mot de passe incorrect', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      await expect(
        service.login({ email: baseUser.email, password: 'mauvais' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("emet des tokens et trace l'activite quand le mot de passe est valide", async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.user.update.mockResolvedValue(baseUser);
      prisma.refreshToken.create.mockResolvedValue({});
      prisma.activity.create.mockResolvedValue({});

      const result = await service.login({
        email: baseUser.email,
        password: 'CorrectHorse42!Battery',
      });

      expect(result.accessToken).toBe('signed-access-token');
      expect(result.refreshToken).toHaveLength(96); // randomBytes(48).toString('hex')
      expect(result.mfaPending).toBe(false);
      expect(prisma.activity.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'LOGIN', userId: baseUser.id }),
      });
    });

    it("renvoie TOTP_REQUIRED quand la 2FA est active et qu'aucun code n'est fourni", async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      mfa.isEnabledFor.mockResolvedValue(true);

      await expect(
        service.login({ email: baseUser.email, password: 'CorrectHorse42!Battery' }),
      ).rejects.toMatchObject({ message: 'TOTP_REQUIRED' });
    });

    it('rejette un code TOTP invalide quand la 2FA est active', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      mfa.isEnabledFor.mockResolvedValue(true);
      mfa.verify.mockResolvedValue(false);

      await expect(
        service.login({
          email: baseUser.email,
          password: 'CorrectHorse42!Battery',
          totpCode: '000000',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('accepte un code TOTP valide quand la 2FA est active', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      mfa.isEnabledFor.mockResolvedValue(true);
      mfa.verify.mockResolvedValue(true);
      prisma.user.update.mockResolvedValue(baseUser);
      prisma.refreshToken.create.mockResolvedValue({});
      prisma.activity.create.mockResolvedValue({});

      const result = await service.login({
        email: baseUser.email,
        password: 'CorrectHorse42!Battery',
        totpCode: '123456',
      });

      expect(result.accessToken).toBe('signed-access-token');
      expect(mfa.verify).toHaveBeenCalledWith(baseUser.id, '123456');
    });

    it("positionne mfaPending=true quand le role est dans la liste 'auth.mfaRequiredRoles' et que la 2FA n'est pas active", async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      mfa.isEnabledFor.mockResolvedValue(false);
      settings.get.mockResolvedValue('ADMIN,MANAGER');
      prisma.user.update.mockResolvedValue(baseUser);
      prisma.refreshToken.create.mockResolvedValue({});
      prisma.activity.create.mockResolvedValue({});

      const result = await service.login({
        email: baseUser.email,
        password: 'CorrectHorse42!Battery',
      });

      expect(result.mfaPending).toBe(true);
    });

    it("n'exige pas mfaPending quand le role n'est pas dans la liste", async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, role: 'SALES' });
      mfa.isEnabledFor.mockResolvedValue(false);
      settings.get.mockResolvedValue('ADMIN,MANAGER');
      prisma.user.update.mockResolvedValue(baseUser);
      prisma.refreshToken.create.mockResolvedValue({});
      prisma.activity.create.mockResolvedValue({});

      const result = await service.login({
        email: baseUser.email,
        password: 'CorrectHorse42!Battery',
      });

      expect(result.mfaPending).toBe(false);
    });
  });

  describe('refresh', () => {
    it('rejette un refresh token inconnu', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh('inconnu')).rejects.toThrow(UnauthorizedException);
    });

    it('rejette un refresh token revoque', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
        user: { ...baseUser },
      });
      await expect(service.refresh('rev')).rejects.toThrow(UnauthorizedException);
    });

    it('rejette un refresh token expire', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: { ...baseUser },
      });
      await expect(service.refresh('exp')).rejects.toThrow(UnauthorizedException);
    });

    it('rejette si l\'utilisateur est desactive entre temps', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000),
        user: { ...baseUser, isActive: false },
      });
      await expect(service.refresh('ok')).rejects.toThrow(UnauthorizedException);
    });

    it('emet de nouveaux tokens et revoque l\'ancien', async () => {
      const existing = {
        id: 'rt-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86400 * 1000),
        user: { ...baseUser },
      };
      prisma.refreshToken.findUnique.mockResolvedValue(existing);
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refresh('valid-token');
      expect(result.accessToken).toBe('signed-access-token');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt-1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe('changePassword', () => {
    it('rejette si l\'ancien mot de passe est incorrect', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      await expect(
        service.changePassword(baseUser.id, {
          oldPassword: 'mauvais',
          newPassword: 'NouveauStrong42!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('hash le nouveau mot de passe et revoque toutes les sessions', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      settings.get.mockResolvedValue('12');
      prisma.user.update.mockResolvedValue(baseUser);
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await service.changePassword(baseUser.id, {
        oldPassword: 'CorrectHorse42!Battery',
        newPassword: 'NouveauStrongPwd42!',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: baseUser.id },
          data: expect.objectContaining({ passwordHash: expect.any(String) }),
        }),
      );
      // Toutes les sessions doivent etre revoquees apres un changement de mot de passe.
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: baseUser.id, revokedAt: null },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
