import { NotFoundException } from '@nestjs/common';
import { GdprService } from './gdpr.service';

// Anti-regression du fix 2026-06-13 : exportContact/anonymizeContact chargeaient
// le contact par id seul (findUnique) -> IDOR. anonymize est destructif (article 17).
// On verifie le refus 404 cross-tenant + la presence du tenantId dans le findFirst.

describe('GdprService — tenant isolation', () => {
  let service: GdprService;
  let prisma: any;

  beforeEach(() => {
    prisma = { contact: { findFirst: jest.fn().mockResolvedValue(null) } };
    service = new GdprService(prisma);
  });

  it('exportContact refuse (404) un contact d\'un autre tenant + scope le findFirst', async () => {
    await expect(service.exportContact('c-X', 'tenant-A')).rejects.toThrow(NotFoundException);
    expect(prisma.contact.findFirst.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ id: 'c-X', tenantId: 'tenant-A' }),
    );
  });

  it('anonymizeContact refuse (404) cross-tenant (anonymisation destructive bloquee)', async () => {
    await expect(service.anonymizeContact('c-X', 'admin-1', 'tenant-A')).rejects.toThrow(NotFoundException);
    expect(prisma.contact.findFirst.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ id: 'c-X', tenantId: 'tenant-A' }),
    );
  });
});
