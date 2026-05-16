import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WebAuthnService } from './webauthn.service';
import { PrismaService } from '../../database/prisma.service';

// Tests sur la couche service (la crypto WebAuthn elle-meme est testee par
// @simplewebauthn/server, on mock leurs functions ici pour eviter le besoin
// de generer de vraies signatures cryptographiques dans un test).

describe('WebAuthnService', () => {
  let service: WebAuthnService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      webAuthnCredential: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      activity: { create: jest.fn().mockResolvedValue({}) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WebAuthnService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn((k: string) => {
          if (k === 'WEBAUTHN_RP_ID') return 'crm.mdoservices.fr';
          if (k === 'WEBAUTHN_RP_NAME') return 'CRM MDO';
          if (k === 'WEBAUTHN_ORIGINS') return 'https://crm.mdoservices.fr';
          return undefined;
        }) } },
      ],
    }).compile();
    service = moduleRef.get(WebAuthnService);
  });

  describe('listForUser', () => {
    it('renvoie les credentials du user avec les bonnes proprietes safe', async () => {
      prisma.webAuthnCredential.findMany.mockResolvedValue([
        { id: 'c1', name: 'YubiKey', aaguid: null, transports: ['usb'], isBackupEligible: false, isBackedUp: false, createdAt: new Date(), lastUsedAt: null },
      ]);
      const r = await service.listForUser('u1');
      expect(r).toHaveLength(1);
      // Pas de publicKey / counter / credentialId dans la response (donnees brutes)
      expect(prisma.webAuthnCredential.findMany).toHaveBeenCalledWith(expect.objectContaining({
        select: expect.not.objectContaining({ publicKey: true, counter: true, credentialId: true }),
      }));
    });
  });

  describe('hasCredentials', () => {
    it('true si user a au moins 1 cle (sert au flow login pour decider WebAuthn vs TOTP)', async () => {
      prisma.webAuthnCredential.count.mockResolvedValue(2);
      expect(await service.hasCredentials('u1')).toBe(true);
    });

    it('false si aucune cle (fallback TOTP / password seul)', async () => {
      prisma.webAuthnCredential.count.mockResolvedValue(0);
      expect(await service.hasCredentials('u1')).toBe(false);
    });
  });

  describe('remove', () => {
    it('autorise si la cle appartient au user', async () => {
      prisma.webAuthnCredential.findUnique.mockResolvedValue({ id: 'c1', userId: 'u1', name: 'YubiKey' });
      prisma.webAuthnCredential.delete.mockResolvedValue({});
      await service.remove('u1', 'c1');
      expect(prisma.webAuthnCredential.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
      expect(prisma.activity.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ action: 'WEBAUTHN_REMOVE', userId: 'u1' }),
      }));
    });

    it('REJETTE si la cle appartient a un autre user (anti cross-user)', async () => {
      prisma.webAuthnCredential.findUnique.mockResolvedValue({ id: 'c1', userId: 'u2', name: 'YubiKey' });
      await expect(service.remove('u1', 'c1')).rejects.toThrow(NotFoundException);
      expect(prisma.webAuthnCredential.delete).not.toHaveBeenCalled();
    });

    it('404 si la cle n\'existe pas', async () => {
      prisma.webAuthnCredential.findUnique.mockResolvedValue(null);
      await expect(service.remove('u1', 'inconnu')).rejects.toThrow(NotFoundException);
    });
  });

  describe('generateAuthenticationOptionsFor', () => {
    it('refuse si l\'utilisateur n\'a aucune cle enregistree', async () => {
      prisma.webAuthnCredential.findMany.mockResolvedValue([]);
      await expect(service.generateAuthenticationOptionsFor('u1')).rejects.toThrow(BadRequestException);
    });
  });
});
