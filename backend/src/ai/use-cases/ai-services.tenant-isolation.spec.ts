import { NotFoundException } from '@nestjs/common';
import { TicketDraftService } from './ticket-draft.service';
import { TicketSummaryService } from './ticket-summary.service';
import { ClientSummaryService } from './client-summary.service';

// Tests anti-regression groupes pour les 3 services AI restants (draft,
// ticket-summary, client-summary). Verifie qu'ils utilisent tous
// findFirst({ id, tenantId }) au lieu de findUnique sans scope.
//
// Fixe par les commits :
// - 8624ada (audit pass 3) : ticket-summary, client-summary, document-extract
// - f1bb1ba (audit pass 4) : ticket-draft (le 5e leak IA manque pass 3)

describe('AI services — tenant isolation (anti-regression)', () => {

  describe('TicketDraftService.draftReply', () => {
    it('filtre par tenantId, throw 404 si ticket hors tenant', async () => {
      const prisma = { ticket: { findFirst: jest.fn().mockResolvedValue(null) } } as any;
      const service = new TicketDraftService(prisma, {} as any);
      await expect(service.draftReply('t-X', 'tenant-A', 'user-1'))
        .rejects.toThrow(NotFoundException);
      expect(prisma.ticket.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 't-X', tenantId: 'tenant-A' }),
        }),
      );
    });
  });

  describe('TicketSummaryService.summarizeThread', () => {
    it('filtre par tenantId, throw 404 si ticket hors tenant', async () => {
      const prisma = { ticket: { findFirst: jest.fn().mockResolvedValue(null) } } as any;
      const service = new TicketSummaryService(prisma, {} as any);
      await expect(service.summarizeThread('t-X', 'tenant-A', 'user-1'))
        .rejects.toThrow(NotFoundException);
      expect(prisma.ticket.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 't-X', tenantId: 'tenant-A' }),
        }),
      );
    });
  });

  describe('ClientSummaryService.summarize', () => {
    it('filtre par tenantId, throw 404 si company hors tenant', async () => {
      const prisma = { company: { findFirst: jest.fn().mockResolvedValue(null) } } as any;
      const service = new ClientSummaryService(prisma, {} as any);
      await expect(service.summarize('co-X', 'tenant-A', 30, 'user-1'))
        .rejects.toThrow(NotFoundException);
      expect(prisma.company.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'co-X', tenantId: 'tenant-A' }),
        }),
      );
    });
  });
});
