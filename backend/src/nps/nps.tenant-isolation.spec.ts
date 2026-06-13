import { NpsService } from './nps.service';

// Tests anti-regression du fix 2026-06-13 : getForTicket/sendForTicket chargeaient
// le ticket par id sans tenant (lecture NPS / envoi mail cross-tenant) et stats()
// agregait les scores de tous les tenants. Verifie le scope via la relation ticket.

describe('NpsService — tenant isolation', () => {
  let service: NpsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      ticketSatisfaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      ticket: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    service = new NpsService(prisma, {} as any, {} as any);
  });

  describe('getForTicket', () => {
    it('scope via la relation ticket.tenantId', async () => {
      await service.getForTicket('tk-1', 'tenant-A');
      const where = prisma.ticketSatisfaction.findFirst.mock.calls[0][0].where;
      expect(where.ticketId).toBe('tk-1');
      expect(where.ticket).toEqual(expect.objectContaining({ tenantId: 'tenant-A' }));
    });

    it('super-admin (null) : pas de filtre par relation ticket', async () => {
      await service.getForTicket('tk-1', null);
      const where = prisma.ticketSatisfaction.findFirst.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('ticket');
    });
  });

  describe('stats', () => {
    it('scope le findMany via la relation ticket.tenantId', async () => {
      await service.stats('tenant-A');
      const where = prisma.ticketSatisfaction.findMany.mock.calls[0][0].where;
      expect(where.ticket).toEqual(expect.objectContaining({ tenantId: 'tenant-A' }));
    });
  });

  describe('sendForTicket', () => {
    it('refuse (404) un ticket d\'un autre tenant', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null); // wrong tenant
      await expect(service.sendForTicket('tk-X', {}, 'tenant-A')).rejects.toThrow();
      const where = prisma.ticket.findFirst.mock.calls[0][0].where;
      expect(where).toEqual(expect.objectContaining({ id: 'tk-X', tenantId: 'tenant-A' }));
    });
  });
});
