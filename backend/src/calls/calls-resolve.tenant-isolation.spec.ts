// Tests anti-regression du fix 3c2b435 (audit pass 2, 2026-05-17).
// resolvePhone(rawNumber, tenantId=null) avait un default null sur tenantId
// → un caller pouvait oublier le scope et matcher cross-tenant. Maintenant
// le parametre tenantId est obligatoire (pas de default), force chaque
// caller a etre explicite.
//
// Verification : statique sur la signature ET runtime sur le comportement.

import * as fs from 'fs';
import * as path from 'path';

describe('CallsService.resolvePhone — tenant isolation', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'calls.service.ts'),
    'utf-8',
  );

  it('signature : tenantId est OBLIGATOIRE (pas de default null)', () => {
    // Avant : tenantId: string | null = null
    // Apres : tenantId: string | null  (sans default)
    expect(source).toMatch(
      /async resolvePhone\(\s*rawNumber:\s*string,\s*tenantId:\s*string\s*\|\s*null\s*\)/,
    );
    // Le default = null doit avoir disparu
    expect(source).not.toMatch(
      /async resolvePhone\(\s*rawNumber:\s*string,\s*tenantId:\s*string\s*\|\s*null\s*=\s*null\s*\)/,
    );
  });

  it('runtime : filtre par tenantId quand fourni', async () => {
    // Mock minimal pour verifier le pattern d'utilisation runtime
    const prisma = {
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
      company: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    // Constructor : { prisma, scope, settings }
    const { CallsService } = await import('./calls.service');
    const service = new CallsService(prisma as any, {} as any, {} as any);
    await service.resolvePhone('+33612345678', 'tenant-A');
    expect(prisma.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-A' }),
      }),
    );
  });

  it('runtime : tenantId=null = bypass (match global, mode webhook)', async () => {
    const prisma = {
      contact: { findFirst: jest.fn().mockResolvedValue(null) },
      company: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const { CallsService } = await import('./calls.service');
    const service = new CallsService(prisma as any, {} as any, {} as any);
    await service.resolvePhone('+33612345678', null);
    // Pas de tenantId dans le where : on accepte global pour webhook.
    const where = prisma.contact.findFirst.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('tenantId');
  });
});
