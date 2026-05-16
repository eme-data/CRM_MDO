import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { SsoService } from './sso.service';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../../settings/settings.service';

// Tests cibles sur la logique JIT provisioning et le matching d'identite
// SSO. Le flow OIDC (discovery, code exchange) est laisse a openid-client
// (battle-tested) — on mock le Client a la place pour tester notre code.

describe('SsoService', () => {
  let service: SsoService;
  let prisma: any;
  let settings: any;

  const tenant = { id: 'tenant-A', slug: 'tenant-a' } as any;

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      activity: { create: jest.fn().mockResolvedValue({}) },
    };
    settings = {
      get: jest.fn().mockResolvedValue(null),
      getBool: jest.fn().mockResolvedValue(false),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SsoService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
      ],
    }).compile();
    service = moduleRef.get(SsoService);
  });

  describe('isEnabledFor', () => {
    it('renvoie le setting sso.enabled du tenant', async () => {
      settings.getBool.mockResolvedValue(true);
      expect(await service.isEnabledFor('tenant-A')).toBe(true);
      expect(settings.getBool).toHaveBeenCalledWith('sso.enabled', 'tenant-A');
    });
  });

  describe('completeLogin — matching/JIT', () => {
    // On stub openid-client Client.callback pour ne pas faire de HTTP reel.
    // L'interaction reelle avec l'IdP n'est pas testee ici (e2e job).
    const session = {
      tenantId: 'tenant-A',
      state: 'state-123',
      nonce: 'nonce-456',
      codeVerifier: 'verifier-789',
    };

    const claims = {
      sub: 'oidc-user-1',
      iss: 'https://idp.example.fr',
      email: 'alice@example.fr',
      given_name: 'Alice',
      family_name: 'Martin',
    };

    beforeEach(() => {
      // On injecte un faux Client dans le cache pour bypass la discovery
      (service as any).clientCache.set('tenant-A', {
        callback: jest.fn().mockResolvedValue({
          claims: () => claims,
        }),
      });
    });

    it('REJETTE si state ne matche pas (CSRF)', async () => {
      await expect(
        service.completeLogin(tenant, 'http://x/cb', 'code', 'autre-state', session),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('REJETTE si session sur un autre tenant', async () => {
      await expect(
        service.completeLogin(tenant, 'http://x/cb', 'code', 'state-123', {
          ...session,
          tenantId: 'tenant-B',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('matche un user existant par (tenantId, ssoIssuer, ssoSubject)', async () => {
      const existing = {
        id: 'u-1', email: 'alice@example.fr', isActive: true,
        ssoIssuer: claims.iss, ssoSubject: claims.sub,
      };
      prisma.user.findFirst.mockResolvedValueOnce(existing);

      const r = await service.completeLogin(tenant, 'http://x/cb', 'code', 'state-123', session);
      expect(r.id).toBe('u-1');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('matche un user existant par email + LIE l\'identite SSO (premier login SSO)', async () => {
      const existing = { id: 'u-1', email: 'alice@example.fr', isActive: true, ssoIssuer: null, ssoSubject: null };
      prisma.user.findFirst
        .mockResolvedValueOnce(null) // pas trouve par (iss, sub)
        .mockResolvedValueOnce(existing); // trouve par email
      prisma.user.update.mockResolvedValue({ ...existing, ssoIssuer: claims.iss, ssoSubject: claims.sub });

      const r = await service.completeLogin(tenant, 'http://x/cb', 'code', 'state-123', session);
      expect(r.ssoIssuer).toBe(claims.iss);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { ssoIssuer: claims.iss, ssoSubject: claims.sub },
      });
    });

    it('JIT provisioning : cree un nouveau user si autorise et inexistant', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      settings.getBool.mockImplementation((k: string) =>
        Promise.resolve(k === 'sso.allowJitProvisioning'),
      );
      settings.get.mockImplementation((k: string) => {
        if (k === 'sso.defaultRole') return Promise.resolve('SALES');
        return Promise.resolve(null);
      });
      const created = {
        id: 'u-new', email: claims.email, isActive: true,
        ssoIssuer: claims.iss, ssoSubject: claims.sub,
      };
      prisma.user.create.mockResolvedValue(created);

      const r = await service.completeLogin(tenant, 'http://x/cb', 'code', 'state-123', session);
      expect(r.id).toBe('u-new');
      expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-A',
          email: 'alice@example.fr',
          ssoIssuer: claims.iss,
          ssoSubject: claims.sub,
          role: 'SALES',
        }),
      }));
    });

    it('REJETTE le JIT si desactive', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      settings.getBool.mockResolvedValue(false); // jit OFF

      await expect(
        service.completeLogin(tenant, 'http://x/cb', 'code', 'state-123', session),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('REJETTE un user desactive (apres match)', async () => {
      const inactive = {
        id: 'u-1', email: 'alice@example.fr', isActive: false,
        ssoIssuer: claims.iss, ssoSubject: claims.sub,
      };
      prisma.user.findFirst.mockResolvedValue(inactive);

      await expect(
        service.completeLogin(tenant, 'http://x/cb', 'code', 'state-123', session),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
