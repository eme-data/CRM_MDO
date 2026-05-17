import { NotFoundException } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';

// Tests anti-regression du fix d781bb9 (audit pass 2, 2026-05-17).
// findById utilisait findUnique({ id }) sans tenantId — un user pouvait
// telecharger une attachment d'un ticket d'un autre tenant en devinant
// l'UUID (PDFs incidents, exports BDD parfois).
// Maintenant : findFirst({ id, tenantId }) + tenantId? = null bypass interne.

describe('AttachmentsService — tenant isolation', () => {
  let service: AttachmentsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      attachment: { findFirst: jest.fn() },
    };
    service = new AttachmentsService({} as any, prisma);
  });

  it('filtre par tenantId quand tenantId fourni', async () => {
    prisma.attachment.findFirst.mockResolvedValue(null);
    await expect(service.findById('a-X', 'tenant-A'))
      .rejects.toThrow(NotFoundException);
    expect(prisma.attachment.findFirst).toHaveBeenCalledWith({
      where: { id: 'a-X', tenantId: 'tenant-A' },
    });
  });

  it('tenantId=null : bypass scope (cas portail / interne)', async () => {
    prisma.attachment.findFirst.mockResolvedValue({ id: 'a-1' });
    await service.findById('a-1', null);
    expect(prisma.attachment.findFirst).toHaveBeenCalledWith({
      where: { id: 'a-1' },
    });
  });

  it('tenantId=undefined (default) : bypass scope', async () => {
    prisma.attachment.findFirst.mockResolvedValue({ id: 'a-1' });
    await service.findById('a-1');
    expect(prisma.attachment.findFirst).toHaveBeenCalledWith({
      where: { id: 'a-1' },
    });
  });

  it('throw 404 si attachment hors tenant', async () => {
    prisma.attachment.findFirst.mockResolvedValue(null);
    await expect(service.findById('a-X', 'tenant-A'))
      .rejects.toThrow(NotFoundException);
  });
});
