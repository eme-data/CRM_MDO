import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai.service';

const SUMMARY_SYSTEM_PROMPT = `Tu rediges une SYNTHESE COURTE de l'activite recente d'un client MDO Services
pour preparer une revue commerciale interne (5 minutes de lecture max).

Format attendu (markdown leger) :
- Section "Faits marquants" (3-5 puces, factuelle)
- Section "Risques / points d'attention" (0-3 puces — omettre si rien)
- Section "Opportunites a saisir" (0-3 puces — omettre si rien)
- Conclusion : 1 phrase d'orientation pour la prochaine semaine.

Regles :
- Reste FACTUEL, ne speculE PAS au-dela des donnees fournies.
- Si l'activite est nulle ou tres faible, dis-le sans broder.
- Ne signe pas, n'inclus pas de salutation.
- Privilegie les chiffres precis quand disponibles ("3 tickets resolus" plutot
  que "quelques tickets").`;

@Injectable()
export class ClientSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async summarize(companyId: string, days: number, userId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, sector: true },
    });
    if (!company) throw new NotFoundException('Societe introuvable');

    const since = new Date(Date.now() - days * 86400_000);

    const [tickets, interventions, contracts, invoicesUnpaid] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { companyId, createdAt: { gte: since } },
        select: { reference: true, title: true, status: true, priority: true, createdAt: true, resolvedAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.intervention.findMany({
        where: { companyId, scheduledAt: { gte: since } },
        select: { title: true, type: true, scheduledAt: true, durationMin: true, status: true },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.contract.findMany({
        where: { companyId, status: { in: ['ACTIVE', 'DRAFT'] } },
        select: { reference: true, offer: true, monthlyAmountHt: true, endDate: true, status: true },
      }),
      this.prisma.invoice.count({
        where: { companyId, paidAt: null, status: { in: ['ISSUED', 'OVERDUE'] } },
      }),
    ]);

    const userMessage = [
      'Societe : ' + company.name + ' (secteur ' + company.sector + ')',
      'Periode : derniers ' + days + ' jours',
      '',
      'Tickets (' + tickets.length + ' au total) :',
      ...tickets.slice(0, 30).map((t) =>
        '- [' + t.priority + ']' + ' ' + t.reference + ' ' + t.title +
        ' (' + t.status + ')' + (t.resolvedAt ? ' resolu' : ''),
      ),
      '',
      'Interventions (' + interventions.length + ') :',
      ...interventions.slice(0, 20).map((i) =>
        '- ' + new Date(i.scheduledAt).toISOString().slice(0, 10) +
        ' ' + i.type + ' : ' + i.title + ' (' + i.status +
        (i.durationMin ? ', ' + i.durationMin + ' min' : '') + ')',
      ),
      '',
      'Contrats actifs : ' + contracts.length,
      ...contracts.slice(0, 10).map((c) =>
        '- ' + c.reference + ' ' + c.offer + ' ' + Number(c.monthlyAmountHt) + ' EUR/mois — fin ' + new Date(c.endDate).toISOString().slice(0, 10),
      ),
      '',
      'Factures impayees : ' + invoicesUnpaid,
    ].join('\n');

    const text = await this.ai.invoke({
      capability: 'CLIENT_SUMMARY',
      systemPrompt: SUMMARY_SYSTEM_PROMPT,
      userMessage,
      maxTokens: 700,
      temperature: 0.3,
      entityType: 'Company',
      entityId: companyId,
      userId,
    });

    return { summary: text.trim(), counts: {
      tickets: tickets.length,
      interventions: interventions.length,
      contracts: contracts.length,
      invoicesUnpaid,
    } };
  }
}
