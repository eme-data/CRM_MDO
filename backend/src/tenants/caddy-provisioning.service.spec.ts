import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CaddyProvisioningService } from './caddy-provisioning.service';
import { PrismaService } from '../database/prisma.service';

describe('CaddyProvisioningService.buildCaddyfile', () => {
  let service: CaddyProvisioningService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CaddyProvisioningService,
        { provide: PrismaService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn((k: string) => {
          if (k === 'ACME_EMAIL') return 'mathieu@mdoservices.fr';
          return undefined;
        }) } },
      ],
    }).compile();
    service = moduleRef.get(CaddyProvisioningService);
  });

  it('cas vide : config valide avec juste le global block', () => {
    const cf = service.buildCaddyfile([]);
    expect(cf).toContain('email mathieu@mdoservices.fr');
    expect(cf).toContain('trusted_proxies static private_ranges');
  });

  it('un tenant : un site block avec domaine + reverse_proxy backend/frontend', () => {
    const cf = service.buildCaddyfile([
      { slug: 'mdo', customDomain: 'crm.mdoservices.fr' },
    ]);
    expect(cf).toContain('crm.mdoservices.fr {');
    expect(cf).toContain('handle /api/* {');
    expect(cf).toContain('reverse_proxy backend:4000');
    expect(cf).toContain('reverse_proxy frontend:3000');
  });

  it('plusieurs tenants : un block par customDomain', () => {
    const cf = service.buildCaddyfile([
      { slug: 'mdo', customDomain: 'crm.mdoservices.fr' },
      { slug: 'seysses', customDomain: 'crm.mairie-seysses.fr' },
      { slug: 'agglo', customDomain: 'crm.agglo-x.fr' },
    ]);
    expect(cf).toContain('crm.mdoservices.fr {');
    expect(cf).toContain('crm.mairie-seysses.fr {');
    expect(cf).toContain('crm.agglo-x.fr {');
    // Verifie qu'il y a 3 site blocks distincts (3 'handle /api/*' = 3 sites)
    expect((cf.match(/handle \/api\/\*/g) ?? []).length).toBe(3);
  });

  it('headers de securite presents dans chaque site (HSTS, X-Frame, etc.)', () => {
    const cf = service.buildCaddyfile([
      { slug: 'mdo', customDomain: 'crm.mdoservices.fr' },
    ]);
    expect(cf).toContain('Strict-Transport-Security');
    expect(cf).toContain('X-Frame-Options "DENY"');
    expect(cf).toContain('X-Content-Type-Options "nosniff"');
    expect(cf).toContain('Permissions-Policy');
  });

  it('endpoint /metrics restreint au reseau interne (172.16.0.0/12, 10.0.0.0/8)', () => {
    const cf = service.buildCaddyfile([
      { slug: 'mdo', customDomain: 'crm.mdoservices.fr' },
    ]);
    expect(cf).toContain('remote_ip 127.0.0.1 172.16.0.0/12 10.0.0.0/8');
    expect(cf).toContain('respond 403');
  });
});
