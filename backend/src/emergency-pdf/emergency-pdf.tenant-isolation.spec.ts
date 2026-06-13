import { NotFoundException } from '@nestjs/common';
import { EmergencyPdfService } from './emergency-pdf.service';

// Anti-regression du fix 2026-06-13 : generateForCompany chargeait la societe par
// id seul (findUnique) -> IDOR (le PDF urgence agrege sites/reseaux/contrats/secrets).
// Verifie le refus 404 cross-tenant + le scope du findFirst.

describe('EmergencyPdfService — tenant isolation', () => {
  let service: EmergencyPdfService;
  let prisma: any;

  beforeEach(() => {
    prisma = { company: { findFirst: jest.fn().mockResolvedValue(null) } };
    service = new EmergencyPdfService(prisma);
  });

  it('refuse (404) une societe d\'un autre tenant + scope le findFirst', async () => {
    await expect(service.generateForCompany('co-X', 'tenant-A')).rejects.toThrow(NotFoundException);
    expect(prisma.company.findFirst.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ id: 'co-X', tenantId: 'tenant-A' }),
    );
  });
});
