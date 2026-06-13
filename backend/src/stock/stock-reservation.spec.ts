import { StockService } from './stock.service';

// Tests de la reservation de stock sur devis (Lot 2) : creation a l'acceptation,
// idempotence, liberation scopee par tenant + devis.

describe('StockService — reservation sur devis', () => {
  let service: StockService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      stockReservation: {
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      quoteLine: { findMany: jest.fn().mockResolvedValue([{ stockItemId: 'it-1', quantity: 2 }]) },
    };
    service = new StockService(prisma, {} as any);
  });

  describe('reserveForQuote', () => {
    it('cree une reservation ACTIVE par ligne liee a un article', async () => {
      const r = await service.reserveForQuote('tenant-A', 'q-1');
      expect(r).toEqual({ reserved: 1 });
      expect(prisma.stockReservation.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [expect.objectContaining({
            tenantId: 'tenant-A', itemId: 'it-1', quoteId: 'q-1', quantity: 2, status: 'ACTIVE',
          })],
        }),
      );
    });

    it('idempotent : ne re-reserve pas si des reservations ACTIVE existent', async () => {
      prisma.stockReservation.count.mockResolvedValue(1);
      const r = await service.reserveForQuote('tenant-A', 'q-1');
      expect(r).toEqual({ skipped: 'already' });
      expect(prisma.stockReservation.createMany).not.toHaveBeenCalled();
    });

    it('ne reserve rien si aucune ligne liee a un article', async () => {
      prisma.quoteLine.findMany.mockResolvedValue([]);
      const r = await service.reserveForQuote('tenant-A', 'q-1');
      expect(r).toEqual({ reserved: 0 });
      expect(prisma.stockReservation.createMany).not.toHaveBeenCalled();
    });
  });

  describe('releaseForQuote', () => {
    it('passe les reservations ACTIVE en RELEASED, scope par tenant + devis', async () => {
      await service.releaseForQuote('tenant-A', 'q-1');
      expect(prisma.stockReservation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-A', quoteId: 'q-1', status: 'ACTIVE' },
          data: expect.objectContaining({ status: 'RELEASED' }),
        }),
      );
    });
  });
});
