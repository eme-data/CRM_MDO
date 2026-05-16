import { TenantThrottlerGuard } from './tenant-throttler.guard';

// Test du getTracker en isolation (la mecanique throttler elle-meme est
// testee par @nestjs/throttler). On verifie juste que la cle de tracking
// inclut bien le tenantId + IP pour isoler les budgets entre tenants.

describe('TenantThrottlerGuard.getTracker', () => {
  // On instancie sans dependencies — getTracker est pure (ne touche que req).
  const guard = Object.create(TenantThrottlerGuard.prototype);

  it('cle = "<tenantId>:<ip>" quand tenant resolu + IP directe', async () => {
    const req: any = { ip: '1.2.3.4', tenant: { id: 'tenant-A' }, headers: {} };
    expect(await guard.getTracker(req)).toBe('tenant-A:1.2.3.4');
  });

  it('isolation : deux tenants meme IP -> trackers distincts', async () => {
    const reqA: any = { ip: '1.2.3.4', tenant: { id: 'tenant-A' }, headers: {} };
    const reqB: any = { ip: '1.2.3.4', tenant: { id: 'tenant-B' }, headers: {} };
    const kA = await guard.getTracker(reqA);
    const kB = await guard.getTracker(reqB);
    expect(kA).not.toBe(kB);
  });

  it('utilise X-Forwarded-For (1er IP) quand present (proxy Caddy)', async () => {
    const req: any = {
      ip: '127.0.0.1',
      tenant: { id: 't' },
      headers: { 'x-forwarded-for': '5.6.7.8, 10.0.0.1' },
    };
    expect(await guard.getTracker(req)).toBe('t:5.6.7.8');
  });

  it('fallback "no-tenant" quand pas de tenant resolu (route publique /health)', async () => {
    const req: any = { ip: '9.9.9.9', headers: {} };
    expect(await guard.getTracker(req)).toBe('no-tenant:9.9.9.9');
  });

  it('fallback "unknown" quand pas d\'IP du tout (cas extreme tests)', async () => {
    const req: any = { tenant: { id: 't' }, headers: {} };
    expect(await guard.getTracker(req)).toBe('t:unknown');
  });
});
