import { Injectable } from '@nestjs/common';
import { TicketPriority, ContractOffer } from '@prisma/client';
import { addHours } from 'date-fns';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class SlaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  // Calcule la dueDate d'un ticket selon le contrat actif du client + la priorite.
  async computeDueDate(
    companyId: string,
    priority: TicketPriority,
    fromDate: Date = new Date(),
  ): Promise<Date | null> {
    const baseHours = await this.baseHoursFromActiveContract(companyId);
    if (baseHours === null) return null;
    const multiplier = await this.priorityMultiplier(priority);
    const finalHours = baseHours * multiplier;
    return addHours(fromDate, finalHours);
  }

  // Heures de base selon le contrat actif (offre la plus elevee si plusieurs)
  private async baseHoursFromActiveContract(companyId: string): Promise<number | null> {
    const now = new Date();
    const activeContract = await this.prisma.contract.findFirst({
      where: {
        companyId,
        status: 'ACTIVE',
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { offer: 'desc' }, // SOUVERAIN > PRO > ESSENTIEL alphabetiquement non, mais l'enum est ordonne dans l'ordre des prix
    });
    const offer: ContractOffer | null = activeContract?.offer ?? null;
    let key = 'sla.default.responseHours';
    if (offer === 'MDO_ESSENTIEL') key = 'sla.essentiel.responseHours';
    else if (offer === 'MDO_PRO') key = 'sla.pro.responseHours';
    else if (offer === 'MDO_SOUVERAIN') key = 'sla.souverain.responseHours';
    const v = await this.settings.getInt(key, 48);
    return v;
  }

  private async priorityMultiplier(priority: TicketPriority): Promise<number> {
    if (priority === 'URGENT') {
      const v = await this.settings.get('sla.priority.urgent');
      return v ? parseFloat(v) : 0.25;
    }
    if (priority === 'HIGH') {
      const v = await this.settings.get('sla.priority.high');
      return v ? parseFloat(v) : 0.5;
    }
    return 1.0;
  }
}
