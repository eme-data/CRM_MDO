import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../database/prisma.service';

// Vague 10 : tests d'isolation tenant sur le JwtStrategy.
// Verifie que le token JWT d'un user du tenant A ne peut pas etre utilise
// pour acceder au domaine du tenant B (defense en profondeur cote auth).

describe('JwtStrategy — isolation tenant', () => {
  let strategy: JwtStrategy;
  let prisma: any;

  const baseUser = {
    id: 'user-1',
    email: 'mathieu@mdoservices.fr',
    firstName: 'Mathieu',
    lastName: 'D',
    role: 'ADMIN',
    isActive: true,
  };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-secret') } },
      ],
    }).compile();
    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('rejette un user inconnu', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      strategy.validate({ tenant: { id: 'tA' } } as any, { sub: 'x', email: '', role: '' } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejette un user desactive', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, isActive: false, tenantId: 'tA' });
    await expect(
      strategy.validate({ tenant: { id: 'tA' } } as any, { sub: baseUser.id, email: '', role: '' } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('REJETTE un token cross-tenant (user du tenant A sur domaine du tenant B)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      tenantId: 'tenant-A',
      isSuperAdmin: false,
    });
    const req = { tenant: { id: 'tenant-B' } } as any;
    await expect(
      strategy.validate(req, { sub: baseUser.id, email: '', role: '' } as any),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('AUTORISE un super-admin a acceder a n\'importe quel tenant', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      tenantId: 'tenant-mdo',
      isSuperAdmin: true,
    });
    const req = { tenant: { id: 'tenant-autre-client' } } as any;
    const result = await strategy.validate(req, {
      sub: baseUser.id,
      email: baseUser.email,
      role: 'ADMIN',
    } as any);
    expect(result.id).toBe(baseUser.id);
    expect(result.isSuperAdmin).toBe(true);
  });

  it('autorise quand le tenantId du user matche le tenant du domaine', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      tenantId: 'tenant-A',
      isSuperAdmin: false,
    });
    const req = { tenant: { id: 'tenant-A' } } as any;
    const result = await strategy.validate(req, {
      sub: baseUser.id,
      email: baseUser.email,
      role: 'ADMIN',
    } as any);
    expect(result.id).toBe(baseUser.id);
    expect(result.tenantId).toBe('tenant-A');
  });

  it('expose mfaPending dans le user retourne quand le payload le porte', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      tenantId: 'tA',
      isSuperAdmin: false,
    });
    const result = await strategy.validate(
      { tenant: { id: 'tA' } } as any,
      { sub: baseUser.id, email: baseUser.email, role: 'ADMIN', mfaPending: true } as any,
    );
    expect(result.mfaPending).toBe(true);
  });

  it('autorise quand req.tenant n\'est pas defini (route tenant-less type /health)', async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      tenantId: 'tenant-A',
      isSuperAdmin: false,
    });
    const req = {} as any;
    const result = await strategy.validate(req, {
      sub: baseUser.id,
      email: baseUser.email,
      role: 'ADMIN',
    } as any);
    expect(result.id).toBe(baseUser.id);
  });
});
