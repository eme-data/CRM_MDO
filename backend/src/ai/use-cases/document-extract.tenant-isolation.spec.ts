import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DocumentExtractService } from './document-extract.service';

// Tests anti-regression du fix 8624ada (audit pass 3, 2026-05-17).
// Le service utilisait findUnique(documentId) sans scope tenant : un user
// du tenant A pouvait declencher Claude Vision sur un KBIS/contrat du
// tenant B en devinant l'UUID → exfiltration en clair via la reponse IA.
// Maintenant : findFirst({ id, tenantId }).

describe('DocumentExtractService — tenant isolation', () => {
  let service: DocumentExtractService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      companyDocument: { findFirst: jest.fn() },
    };
    service = new DocumentExtractService(
      prisma,
      {} as any, // ai
      {} as any, // documents
    );
  });

  it('findFirst utilise tenantId dans la WHERE', async () => {
    prisma.companyDocument.findFirst.mockResolvedValue(null);
    await expect(service.extract('d-1', 'tenant-A', 'user-1'))
      .rejects.toThrow(NotFoundException);
    expect(prisma.companyDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'd-1', tenantId: 'tenant-A' },
      }),
    );
  });

  it('throw 404 si document hors tenant (et pas declenche Claude)', async () => {
    prisma.companyDocument.findFirst.mockResolvedValue(null);
    await expect(service.extract('d-X', 'tenant-A', 'user-1'))
      .rejects.toThrow(NotFoundException);
  });

  it('refuse 400 si format non supporte (Excel)', async () => {
    prisma.companyDocument.findFirst.mockResolvedValue({
      id: 'd-1',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 1000,
      storageKey: 'k',
      category: 'OTHER',
      filename: 'f.xlsx',
      companyId: 'c-1',
    });
    await expect(service.extract('d-1', 'tenant-A', 'user-1'))
      .rejects.toThrow(BadRequestException);
  });
});
