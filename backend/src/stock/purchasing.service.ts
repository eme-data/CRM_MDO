import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { StockService } from './stock.service';
import { CreatePoDto, ReceivePoDto } from './dto/purchasing.dto';

// Commandes fournisseurs (approvisionnement). La reception d'une commande
// genere des entrees de stock valorisees (cf StockService.move).
function isManager(me: JwtUser): boolean {
  return me.isSuperAdmin || me.role === 'ADMIN' || me.role === 'MANAGER';
}
const num = (d: any) => (d == null ? 0 : Number(d));

@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
    private readonly stock: StockService,
  ) {}

  private assertManager(me: JwtUser) {
    if (!isManager(me)) throw new ForbiddenException('Reserve aux gestionnaires (ADMIN/MANAGER)');
  }

  private withTotals(po: any) {
    const totalHt = (po.lines ?? []).reduce((s: number, l: any) => s + num(l.quantityOrdered) * num(l.unitCostHt), 0);
    return { ...po, totalHt: Number(totalHt.toFixed(2)) };
  }

  list(me: JwtUser) {
    return this.prisma.purchaseOrder
      .findMany({
        where: this.scope.scopedWhere(me),
        include: { supplier: { select: { id: true, name: true } }, location: { select: { id: true, name: true } }, lines: true },
        orderBy: { createdAt: 'desc' },
      })
      .then((rows) => rows.map((r) => this.withTotals(r)));
  }

  async get(me: JwtUser, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: {
        supplier: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        lines: { include: { item: { select: { id: true, sku: true, name: true, unit: true } } } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!po) throw new NotFoundException('Commande introuvable');
    return this.withTotals(po);
  }

  async create(me: JwtUser, dto: CreatePoDto) {
    this.assertManager(me);
    await this.assertOwned('supplier', dto.supplierId, me);
    await this.assertOwned('stockLocation', dto.locationId, me);
    for (const l of dto.lines) await this.assertOwned('stockItem', l.itemId, me);

    const year = new Date().getFullYear();
    const count = await this.prisma.purchaseOrder.count({ where: this.scope.scopedWhere(me) });
    const reference = `PO-${year}-${String(count + 1).padStart(4, '0')}`;

    const po = await this.prisma.purchaseOrder.create({
      data: {
        tenantId: me.tenantId, reference, supplierId: dto.supplierId, locationId: dto.locationId,
        status: 'DRAFT', createdById: me.id,
        orderDate: dto.orderDate ? new Date(dto.orderDate) : null,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        notes: dto.notes,
        lines: { create: dto.lines.map((l) => ({ itemId: l.itemId, quantityOrdered: l.quantityOrdered, unitCostHt: l.unitCostHt })) },
      },
      include: { lines: true, supplier: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } },
    });
    return this.withTotals(po);
  }

  async setStatus(me: JwtUser, id: string, status: 'ORDERED' | 'CANCELLED' | 'DRAFT') {
    this.assertManager(me);
    const po = await this.assertOwned('purchaseOrder', id, me);
    if (po.status === 'RECEIVED') throw new BadRequestException('Commande deja receptionnee');
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status } });
  }

  // Reception (totale ou partielle) : alimente le stock + met a jour les
  // quantites recues et le statut de la commande.
  async receive(me: JwtUser, id: string, dto: ReceivePoDto) {
    this.assertManager(me);
    const po = await this.prisma.purchaseOrder.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: { lines: true },
    });
    if (!po) throw new NotFoundException('Commande introuvable');
    if (po.status === 'CANCELLED') throw new BadRequestException('Commande annulee');

    for (const recv of dto.lines) {
      if (recv.quantityReceived <= 0) continue;
      const line = po.lines.find((l) => l.id === recv.lineId);
      if (!line) throw new BadRequestException('Ligne de commande inconnue : ' + recv.lineId);
      const remaining = num(line.quantityOrdered) - num(line.quantityReceived);
      if (recv.quantityReceived > remaining + 1e-9) {
        throw new BadRequestException(`Quantite recue (${recv.quantityReceived}) superieure au reste a livrer (${remaining})`);
      }
      // Entree de stock valorisee au cout de la commande.
      await this.stock.move(me, {
        itemId: line.itemId, locationId: po.locationId, type: 'IN' as any,
        quantity: recv.quantityReceived, unitCostHt: num(line.unitCostHt),
        reason: 'Reception ' + po.reference, refType: 'PurchaseOrder', refId: po.id,
      });
      await this.prisma.purchaseOrderLine.update({
        where: { id: line.id },
        data: { quantityReceived: num(line.quantityReceived) + recv.quantityReceived },
      });
    }

    // Recalcul du statut.
    const fresh = await this.prisma.purchaseOrderLine.findMany({ where: { poId: id } });
    const allReceived = fresh.every((l) => num(l.quantityReceived) >= num(l.quantityOrdered) - 1e-9);
    const anyReceived = fresh.some((l) => num(l.quantityReceived) > 0);
    const status = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : po.status;
    await this.prisma.purchaseOrder.update({ where: { id }, data: { status } });
    return this.get(me, id);
  }

  // Genere des brouillons de commande (DRAFT) a partir des suggestions de
  // reappro : un PO par fournisseur, pre-rempli avec les quantites suggerees.
  // Les articles sans fournisseur sont ignores (PO impossible) et remontes.
  async generateReorderDrafts(me: JwtUser) {
    this.assertManager(me);
    const groups = await this.stock.reorderSuggestions(me);
    const withSupplier = groups.filter((g) => g.supplierId);
    const skippedNoSupplier = groups
      .filter((g) => !g.supplierId)
      .flatMap((g) => g.lines.map((l: any) => l.sku as string));
    if (withSupplier.length === 0) {
      return { created: 0, purchaseOrders: [], skippedNoSupplier };
    }
    // Emplacement de livraison par defaut = premier emplacement actif.
    const loc = await this.prisma.stockLocation.findFirst({
      where: this.scope.scopedWhere(me, { active: true }),
      orderBy: { name: 'asc' },
    });
    if (!loc) {
      throw new BadRequestException('Aucun emplacement actif : creez-en un avant de generer des commandes de reappro.');
    }
    const created: any[] = [];
    for (const g of withSupplier) {
      const po = await this.create(me, {
        supplierId: g.supplierId!,
        locationId: loc.id,
        notes: 'Brouillon genere automatiquement (reappro seuil bas)',
        lines: g.lines.map((l: any) => ({ itemId: l.itemId, quantityOrdered: l.suggestedQty, unitCostHt: l.unitCostHt })),
      });
      created.push(po);
    }
    return { created: created.length, purchaseOrders: created, skippedNoSupplier };
  }

  private async assertOwned(model: 'supplier' | 'stockLocation' | 'stockItem' | 'purchaseOrder', id: string, me: JwtUser): Promise<any> {
    const e = await (this.prisma as any)[model].findFirst({ where: this.scope.scopedWhere(me, { id }) });
    if (!e) throw new NotFoundException('Element introuvable dans ce tenant');
    return e;
  }
}
