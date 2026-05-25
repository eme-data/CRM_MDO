import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

// NOTE multi-tenant : le catalogue produit est SCOPE par tenant.
// Depuis la migration 0003_multi_tenant_root_models, Product.code passe en
// @@unique([tenantId, code]) — chaque tenant a son propre espace de codes.
// Plus besoin de prefixer (ex: "MDO-O365-E3" devient "O365-E3" cote MDO et
// "O365-E3" cote Seysses peuvent coexister sans collision).

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
  ) {}

  async findAll(
    me: JwtUser,
    params: { search?: string; vendor?: string; type?: ProductType; includeInactive?: boolean },
  ) {
    const where: Prisma.ProductWhereInput = this.scope.scopedWhere(me);
    if (!params.includeInactive) where.isActive = true;
    if (params.vendor) where.vendor = params.vendor;
    if (params.type) where.type = params.type;
    if (params.search) {
      where.OR = [
        { code: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.product.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      take: 500,
    });
  }

  async findOne(id: string, me: JwtUser) {
    const p = await this.prisma.product.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: {
        _count: { select: { quoteLines: true } },
      },
    });
    if (!p) throw new NotFoundException('Produit introuvable');
    return p;
  }

  async create(dto: CreateProductDto, me: JwtUser) {
    try {
      return await this.prisma.product.create({ data: { ...dto, tenantId: me.tenantId } as any });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BadRequestException('Code produit deja utilise : ' + dto.code);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateProductDto, me: JwtUser) {
    await this.findOne(id, me);
    try {
      return await this.prisma.product.update({ where: { id }, data: dto as any });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BadRequestException('Code produit deja utilise : ' + dto.code);
      }
      throw err;
    }
  }

  async remove(id: string, me: JwtUser) {
    const p = await this.findOne(id, me);
    if (p._count.quoteLines > 0) {
      // On ne supprime pas un produit utilise dans des devis (perte de
      // trace historique). Soft-delete via isActive=false a la place.
      throw new BadRequestException(
        'Produit utilise dans ' + p._count.quoteLines + ' ligne(s) de devis. Desactivez-le plutot que de le supprimer.',
      );
    }
    await this.prisma.product.delete({ where: { id } });
    return { ok: true };
  }

  // ============================================================
  // Stats catalogue (par tenant)
  // ============================================================
  async stats(me: JwtUser) {
    // Top vendors par marge generee sur les devis ACCEPTED de ce tenant.
    const lines = await this.prisma.quoteLine.findMany({
      where: {
        ...this.scope.scopedWhere(me),
        productId: { not: null },
        purchasePriceHtSnapshot: { not: null },
        quote: { status: 'ACCEPTED' },
      },
      select: {
        quantity: true,
        unitPriceHt: true,
        discountPct: true,
        purchasePriceHtSnapshot: true,
        product: { select: { vendor: true, category: true, code: true, name: true } },
      },
    });

    const byVendor = new Map<string, { revenue: number; cost: number; margin: number; lines: number }>();
    const byProduct = new Map<string, { code: string; name: string; revenue: number; margin: number; units: number }>();

    for (const l of lines) {
      const qty = Number(l.quantity);
      const unitSelling = Number(l.unitPriceHt);
      const discount = Number(l.discountPct);
      const lineRevenue = qty * unitSelling * (1 - discount / 100);
      const purchase = Number(l.purchasePriceHtSnapshot);
      const lineCost = qty * purchase;
      const lineMargin = lineRevenue - lineCost;

      const vendor = l.product?.vendor ?? '— sans vendor —';
      const v = byVendor.get(vendor) ?? { revenue: 0, cost: 0, margin: 0, lines: 0 };
      v.revenue += lineRevenue;
      v.cost += lineCost;
      v.margin += lineMargin;
      v.lines += 1;
      byVendor.set(vendor, v);

      const prodCode = l.product?.code ?? 'unknown';
      const p = byProduct.get(prodCode) ?? {
        code: prodCode,
        name: l.product?.name ?? prodCode,
        revenue: 0,
        margin: 0,
        units: 0,
      };
      p.revenue += lineRevenue;
      p.margin += lineMargin;
      p.units += qty;
      byProduct.set(prodCode, p);
    }

    return {
      vendorBreakdown: Array.from(byVendor.entries())
        .map(([vendor, v]) => ({
          vendor,
          revenue: +v.revenue.toFixed(2),
          cost: +v.cost.toFixed(2),
          margin: +v.margin.toFixed(2),
          marginPct: v.revenue > 0 ? +((v.margin / v.revenue) * 100).toFixed(1) : 0,
          lines: v.lines,
        }))
        .sort((a, b) => b.margin - a.margin),
      topProducts: Array.from(byProduct.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
        .map((p) => ({
          ...p,
          revenue: +p.revenue.toFixed(2),
          margin: +p.margin.toFixed(2),
          units: +p.units.toFixed(0),
        })),
      totalCatalogProducts: await this.prisma.product.count({
        where: this.scope.scopedWhere(me, { isActive: true }),
      }),
    };
  }
}
