import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai.service';

// Genere un compte-rendu trimestriel (QBR — Quarterly Business Review) presentable
// pour un client : synthese executive, niveau de service, interventions, etat
// contractuel/financier, recommandations. Tache a forte valeur -> Opus 4.8.

const SYSTEM_PROMPT = `Tu rediges un COMPTE-RENDU TRIMESTRIEL (QBR) destine a etre presente a un
client par son prestataire IT / infogerance. Ton professionnel, orienté valeur,
factuel. Sortie en MARKDOWN structure, prete a etre lue en reunion.

Structure attendue :
# Bilan de la periode — {nom client}
## Synthese executive
(3-4 phrases : etat de la relation, faits majeurs, tonalite generale)
## Niveau de service
(volume de tickets, repartition par priorite, delai de resolution, points de friction)
## Interventions realisees
(principales interventions, recurrences eventuelles)
## Situation contractuelle & financiere
(contrats en cours, MRR, echeances proches, factures impayees le cas echeant)
## Recommandations
(2-4 actions concretes pour le trimestre a venir : upsell, prevention, optimisation)

Regles :
- Reste FACTUEL : appuie-toi uniquement sur les donnees fournies, n'invente rien.
- Cite des chiffres precis quand disponibles.
- Si une section manque de donnees, indique-le brievement plutot que de broder.
- N'inclus ni salutation ni signature.`;

@Injectable()
export class ClientQbrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async generate(companyId: string, tenantId: string | null, days: number, userId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, tenantId },
      select: { id: true, name: true, sector: true },
    });
    if (!company) throw new NotFoundException('Societe introuvable');

    const since = new Date(Date.now() - days * 86400_000);

    const [tickets, interventions, contracts, opportunities, invoicesUnpaid] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { companyId, createdAt: { gte: since } },
        select: { reference: true, title: true, status: true, priority: true, category: true, createdAt: true, resolvedAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.intervention.findMany({
        where: { companyId, scheduledAt: { gte: since } },
        select: { title: true, type: true, scheduledAt: true, durationMin: true, status: true },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.contract.findMany({
        where: { companyId, status: { in: ['ACTIVE', 'RENEWED', 'DRAFT'] } },
        select: { reference: true, offer: true, monthlyAmountHt: true, endDate: true, status: true },
      }),
      this.prisma.opportunity.findMany({
        where: { companyId, OR: [{ closedAt: { gte: since } }, { stage: { in: ['QUALIFICATION', 'PROPOSITION', 'NEGOCIATION'] } }] },
        select: { title: true, stage: true, amountHt: true, probability: true },
        orderBy: { amountHt: 'desc' },
        take: 10,
      }),
      this.prisma.invoice.count({
        where: { companyId, paidAt: null, status: { in: ['ISSUED', 'OVERDUE'] } },
      }),
    ]);

    // Quelques agregats pre-calcules pour fiabiliser les chiffres cites par l'IA.
    const resolved = tickets.filter((t) => t.resolvedAt);
    const avgResolutionH = resolved.length
      ? Math.round(
          resolved.reduce((s, t) => s + (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 3_600_000, 0) /
            resolved.length,
        )
      : null;
    const mrr = contracts.filter((c) => c.status === 'ACTIVE' || c.status === 'RENEWED').reduce((s, c) => s + Number(c.monthlyAmountHt), 0);

    const userMessage = [
      `Client : ${company.name} (secteur ${company.sector})`,
      `Periode analysee : ${days} derniers jours`,
      '',
      `TICKETS : ${tickets.length} au total, ${resolved.length} resolus` +
        (avgResolutionH != null ? `, delai moyen de resolution ~${avgResolutionH} h` : ''),
      ...tickets.slice(0, 40).map((t) =>
        `- [${t.priority}/${t.category}] ${t.reference} ${t.title} (${t.status})${t.resolvedAt ? ' resolu' : ''}`,
      ),
      '',
      `INTERVENTIONS : ${interventions.length}`,
      ...interventions.slice(0, 25).map((i) =>
        `- ${new Date(i.scheduledAt).toISOString().slice(0, 10)} ${i.type} : ${i.title} (${i.status}${i.durationMin ? ', ' + i.durationMin + ' min' : ''})`,
      ),
      '',
      `CONTRATS : ${contracts.length} — MRR actif ${mrr.toFixed(2)} EUR HT`,
      ...contracts.map((c) =>
        `- ${c.reference} ${c.offer} ${Number(c.monthlyAmountHt)} EUR/mois — fin ${new Date(c.endDate).toISOString().slice(0, 10)} (${c.status})`,
      ),
      '',
      `OPPORTUNITES :`,
      ...opportunities.map((o) => `- ${o.title} — ${o.stage} — ${Number(o.amountHt)} EUR (${o.probability}%)`),
      '',
      `FACTURES IMPAYEES : ${invoicesUnpaid}`,
    ].join('\n');

    const qbr = await this.ai.invoke({
      capability: 'CLIENT_QBR',
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      modelOverride: 'claude-opus-4-8',
      maxTokens: 2200,
      temperature: 0.4,
      entityType: 'Company',
      entityId: companyId,
      userId,
      tenantId,
    });

    return {
      qbr: qbr.trim(),
      periodDays: days,
      stats: {
        tickets: tickets.length,
        resolved: resolved.length,
        avgResolutionH,
        interventions: interventions.length,
        mrr: Number(mrr.toFixed(2)),
        invoicesUnpaid,
      },
    };
  }
}
