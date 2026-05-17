import { NotFoundException } from '@nestjs/common';
import { TicketTriageService } from './ticket-triage.service';

// Tests anti-regression du fix 8624ada (audit pass 3, 2026-05-17).
// triage() et applyTriage() utilisaient findUnique sans tenantId.
// Maintenant : findFirst({ id, tenantId }).

describe('TicketTriageService — tenant isolation', () => {
  let service: TicketTriageService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      ticket: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      activity: { create: jest.fn() },
    };
    service = new TicketTriageService(prisma, {} as any);
  });

  describe('triage', () => {
    it('filtre par tenantId dans la WHERE', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null);
      await expect(service.triage('t-1', 'tenant-A', 'user-1'))
        .rejects.toThrow(NotFoundException);
      expect(prisma.ticket.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't-1', tenantId: 'tenant-A' },
        }),
      );
    });

    it('throw 404 si ticket hors tenant (et donc Claude pas declenche)', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null);
      await expect(service.triage('t-X', 'tenant-A', 'user-1'))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('applyTriage', () => {
    it('filtre par tenantId avant update', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null);
      await expect(service.applyTriage('t-1', {}, 'tenant-A', 'user-1'))
        .rejects.toThrow(NotFoundException);
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });

    it('autorise si ticket dans le tenant', async () => {
      prisma.ticket.findFirst.mockResolvedValue({ id: 't-1', tenantId: 'tenant-A' });
      prisma.ticket.update.mockResolvedValue({ id: 't-1' });
      await service.applyTriage('t-1', { priority: 'HIGH' }, 'tenant-A', 'user-1');
      expect(prisma.ticket.update).toHaveBeenCalled();
    });
  });
});
