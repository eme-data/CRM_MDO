import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai.service';

// Genere les lignes d'un devis a partir d'une description en langage naturel,
// en s'appuyant sur le catalogue produits du tenant. Tache a forte valeur :
// on force Opus 4.8 (modelOverride) plutot que le modele par defaut du tenant.

const SYSTEM_PROMPT = `Tu es un assistant commercial pour un prestataire IT / infogerance.
A partir d'une demande en langage naturel, tu proposes les LIGNES d'un devis.

Tu reponds UNIQUEMENT avec un objet JSON valide (aucun texte autour, pas de bloc markdown), de la forme :
{"lines":[{"description":"...","quantity":1,"unitPriceHt":0,"productSku":"SKU-OU-null"}],"note":"..."}

Regles :
- Une ligne par poste. "description" = libelle clair et professionnel (francais).
- "quantity" : nombre positif. "unitPriceHt" : prix de VENTE HT en euros (nombre).
- Quand un article du CATALOGUE fourni correspond a un poste, REUTILISE son SKU
  dans "productSku" et son prix de vente. Sinon "productSku": null et estime un
  prix de marche realiste pour du materiel/prestation IT.
- Ajoute les prestations evidentes (installation, configuration) si la demande
  les implique, meme si elles ne sont pas au catalogue.
- N'invente pas de produits hors perimetre IT/infogerance.
- "note" : une phrase de recommandation commerciale, ou "" si rien d'utile.`;

export interface SuggestedLine {
  description: string;
  quantity: number;
  unitPriceHt: number;
  productId: string | null;
  productSku: string | null;
}

@Injectable()
export class QuoteAssistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async assist(description: string, tenantId: string | null, userId: string) {
    const desc = (description ?? '').trim();
    if (desc.length < 3) {
      return { lines: [], note: 'Decris le besoin pour generer des lignes.' };
    }

    // Catalogue produits du tenant (scope tenant : pas de fuite cross-tenant).
    const products = await this.prisma.product.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, name: true, category: true, sellingPriceHt: true },
      orderBy: { name: 'asc' },
      take: 300,
    });
    const bySku = new Map(products.filter((p) => p.code).map((p) => [p.code as string, p]));

    const catalogue = products.length
      ? products
          .map((p) => `- [${p.code ?? '—'}] ${p.name}${p.category ? ' (' + p.category + ')' : ''} — vente ${Number(p.sellingPriceHt ?? 0)} EUR HT`)
          .join('\n')
      : '(catalogue vide)';

    const userMessage = `Demande du commercial :\n${desc}\n\nCATALOGUE PRODUITS :\n${catalogue}`;

    const raw = await this.ai.invoke({
      capability: 'QUOTE_ASSIST',
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      modelOverride: 'claude-opus-4-8',
      maxTokens: 1500,
      temperature: 0.3,
      entityType: 'Quote',
      userId,
      tenantId,
    });

    const parsed = this.parseJson(raw);
    const lines: SuggestedLine[] = (parsed?.lines ?? [])
      .filter((l: any) => l && typeof l.description === 'string')
      .map((l: any) => {
        const sku: string | null = typeof l.productSku === 'string' ? l.productSku : null;
        const prod = sku ? bySku.get(sku) : undefined;
        return {
          description: String(l.description).trim(),
          quantity: this.num(l.quantity, 1),
          unitPriceHt: this.num(l.unitPriceHt, prod ? Number(prod.sellingPriceHt ?? 0) : 0),
          productId: prod?.id ?? null,
          productSku: prod?.code ?? null,
        };
      })
      .filter((l: SuggestedLine) => l.description.length > 0);

    return { lines, note: typeof parsed?.note === 'string' ? parsed.note : '' };
  }

  // L'IA renvoie normalement du JSON pur, mais on tolere un eventuel texte
  // autour (extraction du premier objet { ... }).
  private parseJson(raw: string): any {
    try {
      return JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try { return JSON.parse(m[0]); } catch { /* ignore */ }
      }
      return null;
    }
  }

  private num(v: any, fallback: number): number {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }
}
