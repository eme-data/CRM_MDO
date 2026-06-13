import { NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';

// Tests anti-regression : ces tests cassent si un futur commit re-introduit
// le leak multi-tenant fixe en d781bb9 (audit pass 2, 2026-05-17).
//
// Pour invoices, le scope est par signature : `tenantId: string | null` passé
// explicitement (pattern different de TenantScope helper). On verifie que
// aging() / setStatus() / remove() utilisent ce tenantId dans leurs WHERE.

describe('InvoicesService — tenant isolation', () => {
  let service: InvoicesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      invoice: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new InvoicesService(prisma, {} as any, {} as any);
  });

  describe('aging', () => {
    it('filtre par tenantId', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.aging('tenant-A');
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-A' }),
        }),
      );
    });

    it('avec tenantId=null : super-admin voit toutes les factures impayees', async () => {
      // null est utilise pour le mode super-admin (pas de scope tenant)
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.aging(null);
      const where = prisma.invoice.findMany.mock.calls[0][0].where;
      expect(where.tenantId).toBeNull();
    });
  });

  describe('setStatus', () => {
    it('refuse (404) de modifier une facture d\'un autre tenant', async () => {
      // findFirst({ id, tenantId }) renvoie null car wrong tenant
      prisma.invoice.findFirst.mockResolvedValue(null);
      await expect(service.setStatus('inv-X', 'PAID', 'tenant-A'))
        .rejects.toThrow(NotFoundException);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('autorise si facture dans le bon tenant', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ id: 'inv-1' });
      prisma.invoice.update.mockResolvedValue({ id: 'inv-1', status: 'PAID' });
      await service.setStatus('inv-1', 'PAID', 'tenant-A');
      expect(prisma.invoice.findFirst).toHaveBeenCalledWith({
        where: { id: 'inv-1', tenantId: 'tenant-A' },
        select: { id: true },
      });
      expect(prisma.invoice.update).toHaveBeenCalled();
    });

    it('passe paidAt si status=PAID', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ id: 'inv-1' });
      prisma.invoice.update.mockResolvedValue({});
      await service.setStatus('inv-1', 'PAID', 'tenant-A');
      const updateData = prisma.invoice.update.mock.calls[0][0].data;
      expect(updateData.status).toBe('PAID');
      expect(updateData.paidAt).toBeInstanceOf(Date);
    });
  });

  describe('remove', () => {
    it('refuse de supprimer une facture d\'un autre tenant', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      await expect(service.remove('inv-X', 'tenant-A'))
        .rejects.toThrow(NotFoundException);
      expect(prisma.invoice.delete).not.toHaveBeenCalled();
    });

    it('refuse de supprimer une facture non-DRAFT (meme dans le bon tenant)', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ id: 'inv-1', status: 'ISSUED' });
      await expect(service.remove('inv-1', 'tenant-A')).rejects.toThrow();
      expect(prisma.invoice.delete).not.toHaveBeenCalled();
    });

    it('supprime si DRAFT dans le bon tenant', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ id: 'inv-1', status: 'DRAFT' });
      prisma.invoice.delete.mockResolvedValue({});
      await expect(service.remove('inv-1', 'tenant-A'))
        .resolves.toEqual({ success: true });
    });
  });
});
