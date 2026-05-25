import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContractOffer, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

interface TemplateLineInput {
  description: string;
  quantity: number;
  unitPriceHt: number;
  discountPct?: number;
  productId?: string;
  position?: number;
}

// Multi-tenant : les templates de devis sont specifiques au catalogue
// commercial de chaque tenant. Toute query passe par scope.scopedWhere(me)
// + tout create copie le tenantId du caller. Cf migration 0003.

@Injectable()
export class QuoteTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
  ) {}

  list(me: JwtUser, includeInactive = false) {
    return this.prisma.quoteTemplate.findMany({
      where: this.scope.scopedWhere(me, includeInactive ? {} : { isActive: true }),
      include: {
        lines: {
          orderBy: { position: 'asc' },
          include: { product: { select: { id: true, code: true, name: true } } },
        },
        _count: { select: { lines: true } },
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, me: JwtUser) {
    const t = await this.prisma.quoteTemplate.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: {
        lines: {
          orderBy: { position: 'asc' },
          include: { product: { select: { id: true, code: true, name: true, sellingPriceHt: true } } },
        },
      },
    });
    if (!t) throw new NotFoundException('Template introuvable');
    return t;
  }

  async create(input: {
    name: string;
    description?: string;
    category?: string;
    offer?: ContractOffer | null;
    defaultTerms?: string;
    lines: TemplateLineInput[];
  }, me: JwtUser) {
    if (input.lines.length === 0) throw new BadRequestException('Au moins une ligne requise');
    return this.prisma.quoteTemplate.create({
      data: {
        tenantId: me.tenantId,
        name: input.name,
        description: input.description,
        category: input.category,
        offer: input.offer ?? null,
        defaultTerms: input.defaultTerms,
        lines: {
          create: input.lines.map((l, i) => ({
            position: l.position ?? i,
            description: l.description,
            quantity: l.quantity,
            unitPriceHt: l.unitPriceHt,
            discountPct: l.discountPct ?? 0,
            productId: l.productId ?? null,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async update(id: string, input: {
    name?: string;
    description?: string | null;
    category?: string | null;
    offer?: ContractOffer | null;
    defaultTerms?: string | null;
    isActive?: boolean;
    lines?: TemplateLineInput[];
  }, me: JwtUser) {
    await this.findOne(id, me); // assert tenant ownership
    const data: Prisma.QuoteTemplateUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.category !== undefined) data.category = input.category;
    if (input.offer !== undefined) data.offer = input.offer;
    if (input.defaultTerms !== undefined) data.defaultTerms = input.defaultTerms;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    return this.prisma.$transaction(async (tx) => {
      if (input.lines) {
        await tx.quoteTemplateLine.deleteMany({ where: { templateId: id } });
        await tx.quoteTemplateLine.createMany({
          data: input.lines.map((l, i) => ({
            templateId: id,
            position: l.position ?? i,
            description: l.description,
            quantity: l.quantity,
            unitPriceHt: l.unitPriceHt,
            discountPct: l.discountPct ?? 0,
            productId: l.productId ?? null,
          })),
        });
      }
      return tx.quoteTemplate.update({ where: { id }, data, include: { lines: true } });
    });
  }

  async remove(id: string, me: JwtUser) {
    await this.findOne(id, me); // assert tenant ownership
    await this.prisma.quoteTemplate.delete({ where: { id } });
    return { ok: true };
  }

  // Renvoie les lignes pretes a etre injectees dans le formulaire de nouveau
  // devis (memes champs que QuoteLineDto cote API).
  async expand(id: string, me: JwtUser) {
    const t = await this.findOne(id, me);
    return {
      template: { id: t.id, name: t.name, defaultTerms: t.defaultTerms },
      lines: t.lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        // Si le produit a un sellingPriceHt actuel, on prefere — c'est plus
        // a jour que le prix stocke dans le template.
        unitPriceHt: l.product?.sellingPriceHt ? Number(l.product.sellingPriceHt) : Number(l.unitPriceHt),
        discountPct: Number(l.discountPct),
        productId: l.productId ?? undefined,
      })),
    };
  }
}
