import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import {
  CreateItemDto, UpdateItemDto, MovementDto, TransferDto, AdjustDto,
  CreateSupplierDto, UpdateSupplierDto, CreateLocationDto, UpdateLocationDto,
  CreateSerialDto, UpdateSerialDto,
} from './dto/stock.dto';

// Gestion de stock : articles, niveaux par emplacement, mouvements valorises
// (cout moyen pondere), transferts, inventaire, fournisseurs, emplacements,
// numeros de serie. Reservation gestion aux managers (ADMIN/MANAGER) pour les
// ecritures sensibles ; lecture ouverte aux utilisateurs du tenant.

const n = (d: Prisma.Decimal | number | null | undefined): number => (d == null ? 0 : Number(d));

function isManager(me: JwtUser): boolean {
  return me.isSuperAdmin || me.role === 'ADMIN' || me.role === 'MANAGER';
}

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
  ) {}

  private assertManager(me: JwtUser) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux gestionnaires de stock (ADMIN/MANAGER)');
  }

  // ---------------- Emplacements ----------------
  listLocations(me: JwtUser) {
    return this.prisma.stockLocation.findMany({ where: this.scope.scopedWhere(me), orderBy: { name: 'asc' } });
  }
  async createLocation(me: JwtUser, dto: CreateLocationDto) {
    this.assertManager(me);
    return this.prisma.stockLocation.create({ data: { tenantId: me.tenantId, ...dto } });
  }
  async updateLocation(me: JwtUser, id: string, dto: UpdateLocationDto) {
    this.assertManager(me);
    await this.assertOwned('stockLocation', id, me);
    return this.prisma.stockLocation.update({ where: { id }, data: dto });
  }

  // ---------------- Fournisseurs ----------------
  listSuppliers(me: JwtUser) {
    return this.prisma.supplier.findMany({ where: this.scope.scopedWhere(me), orderBy: { name: 'asc' } });
  }
  async createSupplier(me: JwtUser, dto: CreateSupplierDto) {
    this.assertManager(me);
    return this.prisma.supplier.create({ data: { tenantId: me.tenantId, ...dto } });
  }
  async updateSupplier(me: JwtUser, id: string, dto: UpdateSupplierDto) {
    this.assertManager(me);
    await this.assertOwned('supplier', id, me);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  // ---------------- Articles ----------------
  async listItems(me: JwtUser) {
    const items = await this.prisma.stockItem.findMany({
      where: this.scope.scopedWhere(me),
      include: { levels: true, supplier: { select: { id: true, name: true } }, product: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    return items.map((it) => this.decorate(it));
  }

  async getItem(me: JwtUser, id: string) {
    const it = await this.prisma.stockItem.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: {
        levels: { include: { location: { select: { id: true, name: true } } } },
        supplier: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
        serials: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!it) throw new NotFoundException('Article introuvable');
    return this.decorate(it);
  }

  private decorate(it: any) {
    const totalQty = (it.levels ?? []).reduce((s: number, l: any) => s + n(l.quantity), 0);
    const reorderPoint = n(it.reorderPoint);
    return {
      ...it,
      avgCostHt: n(it.avgCostHt),
      reorderPoint,
      totalQty,
      stockValue: totalQty * n(it.avgCostHt),
      lowStock: reorderPoint > 0 && totalQty <= reorderPoint,
    };
  }

  async createItem(me: JwtUser, dto: CreateItemDto) {
    this.assertManager(me);
    if (dto.productId) await this.assertOwned('product', dto.productId, me);
    if (dto.supplierId) await this.assertOwned('supplier', dto.supplierId, me);
    try {
      return await this.prisma.stockItem.create({
        data: {
          tenantId: me.tenantId, sku: dto.sku, name: dto.name, description: dto.description,
          category: dto.category, unit: dto.unit ?? 'piece', productId: dto.productId ?? null,
          supplierId: dto.supplierId ?? null, reorderPoint: dto.reorderPoint ?? 0,
          avgCostHt: dto.avgCostHt ?? 0, trackSerial: dto.trackSerial ?? false,
        },
      });
    } catch (e: any) {
      if (e.code === 'P2002') throw new BadRequestException('Un article avec ce SKU existe deja');
      throw e;
    }
  }

  async updateItem(me: JwtUser, id: string, dto: UpdateItemDto) {
    this.assertManager(me);
    await this.assertOwned('stockItem', id, me);
    if (dto.productId) await this.assertOwned('product', dto.productId, me);
    if (dto.supplierId) await this.assertOwned('supplier', dto.supplierId, me);
    return this.prisma.stockItem.update({ where: { id }, data: dto as any });
  }

  // ---------------- Mouvements ----------------
  async listMovements(me: JwtUser, itemId?: string, take = 100) {
    return this.prisma.stockMovement.findMany({
      where: this.scope.scopedWhere(me, itemId ? { itemId } : {}),
      include: {
        item: { select: { id: true, sku: true, name: true, unit: true } },
        location: { select: { id: true, name: true } },
        performedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 500),
    });
  }

  // Entree (IN) ou sortie (OUT). Met a jour le niveau de l'emplacement et, pour
  // une entree valorisee, recalcule le cout moyen pondere de l'article.
  async move(me: JwtUser, dto: MovementDto) {
    this.assertManager(me);
    if (dto.type !== 'IN' && dto.type !== 'OUT') {
      throw new BadRequestException('Utilisez /stock/transfer ou /stock/adjust pour ce type');
    }
    const item = await this.assertOwned('stockItem', dto.itemId, me);
    await this.assertOwned('stockLocation', dto.locationId, me);

    return this.prisma.$transaction(async (tx) => {
      const level = await tx.stockLevel.findUnique({ where: { itemId_locationId: { itemId: dto.itemId, locationId: dto.locationId } } });
      const current = n(level?.quantity);

      let unitCost: number;
      if (dto.type === 'OUT') {
        if (current < dto.quantity) throw new BadRequestException(`Stock insuffisant (${current} dispo sur cet emplacement)`);
        unitCost = dto.unitCostHt ?? n(item.avgCostHt);
        await this.setLevel(tx, me, dto.itemId, dto.locationId, current - dto.quantity);
      } else {
        unitCost = dto.unitCostHt ?? n(item.avgCostHt);
        await this.setLevel(tx, me, dto.itemId, dto.locationId, current + dto.quantity);
        // Recalcul PMP sur le total tous emplacements confondus.
        const agg = await tx.stockLevel.aggregate({ _sum: { quantity: true }, where: { itemId: dto.itemId } });
        const totalBefore = n(agg._sum.quantity) - dto.quantity; // on vient d'ajouter dto.quantity
        const oldAvg = n(item.avgCostHt);
        const newAvg = totalBefore + dto.quantity > 0
          ? (totalBefore * oldAvg + dto.quantity * unitCost) / (totalBefore + dto.quantity)
          : unitCost;
        await tx.stockItem.update({ where: { id: dto.itemId }, data: { avgCostHt: Number(newAvg.toFixed(2)) } });
      }

      return tx.stockMovement.create({
        data: {
          tenantId: me.tenantId, itemId: dto.itemId, locationId: dto.locationId, type: dto.type,
          quantity: dto.quantity, unitCostHt: unitCost, reason: dto.reason,
          refType: dto.refType, refId: dto.refId, performedById: me.id,
        },
      });
    });
  }

  async transfer(me: JwtUser, dto: TransferDto) {
    this.assertManager(me);
    if (dto.fromLocationId === dto.toLocationId) throw new BadRequestException('Emplacements source et destination identiques');
    await this.assertOwned('stockItem', dto.itemId, me);
    await this.assertOwned('stockLocation', dto.fromLocationId, me);
    await this.assertOwned('stockLocation', dto.toLocationId, me);

    return this.prisma.$transaction(async (tx) => {
      const from = await tx.stockLevel.findUnique({ where: { itemId_locationId: { itemId: dto.itemId, locationId: dto.fromLocationId } } });
      const curFrom = n(from?.quantity);
      if (curFrom < dto.quantity) throw new BadRequestException(`Stock insuffisant a la source (${curFrom} dispo)`);
      const to = await tx.stockLevel.findUnique({ where: { itemId_locationId: { itemId: dto.itemId, locationId: dto.toLocationId } } });
      await this.setLevel(tx, me, dto.itemId, dto.fromLocationId, curFrom - dto.quantity);
      await this.setLevel(tx, me, dto.itemId, dto.toLocationId, n(to?.quantity) + dto.quantity);
      return tx.stockMovement.create({
        data: {
          tenantId: me.tenantId, itemId: dto.itemId, locationId: dto.toLocationId, type: 'TRANSFER',
          quantity: dto.quantity, fromLocationId: dto.fromLocationId, reason: dto.reason, performedById: me.id,
        },
      });
    });
  }

  // Inventaire : fixe la quantite reelle constatee a un emplacement.
  async adjust(me: JwtUser, dto: AdjustDto) {
    this.assertManager(me);
    await this.assertOwned('stockItem', dto.itemId, me);
    await this.assertOwned('stockLocation', dto.locationId, me);
    return this.prisma.$transaction(async (tx) => {
      const level = await tx.stockLevel.findUnique({ where: { itemId_locationId: { itemId: dto.itemId, locationId: dto.locationId } } });
      const current = n(level?.quantity);
      const delta = dto.countedQuantity - current;
      if (delta === 0) throw new BadRequestException('Aucun ecart a ajuster');
      await this.setLevel(tx, me, dto.itemId, dto.locationId, dto.countedQuantity);
      return tx.stockMovement.create({
        data: {
          tenantId: me.tenantId, itemId: dto.itemId, locationId: dto.locationId, type: 'ADJUSTMENT',
          quantity: Math.abs(delta), reason: (delta > 0 ? '+' : '-') + Math.abs(delta) + (dto.reason ? ' — ' + dto.reason : ''),
          performedById: me.id,
        },
      });
    });
  }

  private async setLevel(tx: Prisma.TransactionClient, me: JwtUser, itemId: string, locationId: string, qty: number) {
    await tx.stockLevel.upsert({
      where: { itemId_locationId: { itemId, locationId } },
      create: { tenantId: me.tenantId, itemId, locationId, quantity: qty },
      update: { quantity: qty },
    });
  }

  // ---------------- Numeros de serie ----------------
  async createSerial(me: JwtUser, dto: CreateSerialDto) {
    this.assertManager(me);
    await this.assertOwned('stockItem', dto.itemId, me);
    if (dto.locationId) await this.assertOwned('stockLocation', dto.locationId, me);
    try {
      return await this.prisma.stockSerial.create({
        data: { tenantId: me.tenantId, itemId: dto.itemId, serial: dto.serial, locationId: dto.locationId ?? null, notes: dto.notes },
      });
    } catch (e: any) {
      if (e.code === 'P2002') throw new BadRequestException('Ce numero de serie existe deja');
      throw e;
    }
  }
  async updateSerial(me: JwtUser, id: string, dto: UpdateSerialDto) {
    this.assertManager(me);
    await this.assertOwned('stockSerial', id, me);
    return this.prisma.stockSerial.update({ where: { id }, data: dto as any });
  }

  // ---------------- Dashboard / alertes ----------------
  async dashboard(me: JwtUser) {
    const items = await this.listItems(me);
    const lowStock = items.filter((i) => i.lowStock);
    const stockValue = items.reduce((s, i) => s + i.stockValue, 0);
    const [locations, suppliers, openPo, recentMovements] = await Promise.all([
      this.prisma.stockLocation.count({ where: this.scope.scopedWhere(me, { active: true }) }),
      this.prisma.supplier.count({ where: this.scope.scopedWhere(me, { active: true }) }),
      this.prisma.purchaseOrder.count({ where: this.scope.scopedWhere(me, { status: { in: ['ORDERED', 'PARTIAL'] } }) }),
      this.listMovements(me, undefined, 8),
    ]);
    return {
      itemCount: items.length,
      lowStockCount: lowStock.length,
      stockValueHt: Number(stockValue.toFixed(2)),
      locationCount: locations,
      supplierCount: suppliers,
      openPoCount: openPo,
      lowStock: lowStock.slice(0, 20).map((i) => ({ id: i.id, sku: i.sku, name: i.name, totalQty: i.totalQty, reorderPoint: i.reorderPoint, unit: i.unit })),
      recentMovements,
    };
  }

  // Verifie l'appartenance au tenant d'une entite et la renvoie.
  private async assertOwned(model: 'stockItem' | 'stockLocation' | 'supplier' | 'stockSerial' | 'product', id: string, me: JwtUser): Promise<any> {
    const where = this.scope.scopedWhere(me, { id });
    const e = await (this.prisma as any)[model].findFirst({ where });
    if (!e) throw new NotFoundException('Element introuvable dans ce tenant');
    return e;
  }
}
