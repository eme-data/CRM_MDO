import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import {
  CreateItemDto, UpdateItemDto, MovementDto, TransferDto, AdjustDto,
  CreateSupplierDto, UpdateSupplierDto, CreateLocationDto, UpdateLocationDto,
  CreateSerialDto, UpdateSerialDto, ConsumeDto,
} from './dto/stock.dto';

// Gestion de stock : articles, niveaux par emplacement, mouvements valorises
// (cout moyen pondere), transferts, inventaire, fournisseurs, emplacements,
// numeros de serie. Reservation gestion aux managers (ADMIN/MANAGER) pour les
// ecritures sensibles ; lecture ouverte aux utilisateurs du tenant.

const n = (d: Prisma.Decimal | number | null | undefined): number => (d == null ? 0 : Number(d));

function isManager(me: JwtUser): boolean {
  return me.isSuperAdmin || me.role === 'ADMIN' || me.role === 'MANAGER';
}

// Echappement CSV (separateur ';', BOM UTF-8 ajoute par l'appelant) — meme
// convention que les autres exports du CRM (Excel FR).
function csvEscape(s: string): string {
  if (s.includes(';') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
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
    const reserved = await this.reservedByItem(this.scope.scopedWhere(me, { status: 'ACTIVE' }));
    return items.map((it) => this.decorate(it, reserved.get(it.id) ?? 0));
  }

  async getItem(me: JwtUser, id: string) {
    const it = await this.prisma.stockItem.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: {
        levels: { include: { location: { select: { id: true, name: true } } } },
        supplier: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
        serials: { include: { asset: { select: { id: true, name: true, company: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' } },
        reservations: {
          where: { status: 'ACTIVE' },
          include: { quote: { select: { id: true, reference: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!it) throw new NotFoundException('Article introuvable');
    const reservedQty = (it.reservations ?? []).reduce((s: number, r: any) => s + n(r.quantity), 0);
    return this.decorate(it, reservedQty);
  }

  // Somme des quantites reservees (ACTIVE) par article, pour calculer le stock
  // disponible (= physique - reserve). `where` doit deja scoper le tenant.
  private async reservedByItem(where: Prisma.StockReservationWhereInput): Promise<Map<string, number>> {
    const rows = await this.prisma.stockReservation.groupBy({
      by: ['itemId'],
      where,
      _sum: { quantity: true },
    });
    return new Map(rows.map((r) => [r.itemId, n(r._sum.quantity)]));
  }

  private decorate(it: any, reservedQty = 0) {
    const totalQty = (it.levels ?? []).reduce((s: number, l: any) => s + n(l.quantity), 0);
    const reorderPoint = n(it.reorderPoint);
    return {
      ...it,
      avgCostHt: n(it.avgCostHt),
      reorderPoint,
      totalQty,
      reservedQty,
      availableQty: totalQty - reservedQty,
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
    await this.setLevelT(tx, me.tenantId ?? null, itemId, locationId, qty);
  }
  private async setLevelT(tx: Prisma.TransactionClient, tenantId: string | null, itemId: string, locationId: string, qty: number) {
    await tx.stockLevel.upsert({
      where: { itemId_locationId: { itemId, locationId } },
      create: { tenantId: tenantId ?? undefined, itemId, locationId, quantity: qty },
      update: { quantity: qty },
    });
  }

  // ---------------- Hook facturation (decrement a l'emission) ----------------
  // Appele par InvoicesService quand une facture passe a ISSUED (si le reglage
  // stock.deductOnInvoice est actif). Best-effort : decremente ce qui est
  // disponible a l'emplacement, ne bloque jamais. Idempotent (refType=Invoice).
  async deductForInvoice(tenantId: string | null, invoiceId: string, locationId: string | null) {
    if (!locationId) return { skipped: 'no-location' };
    const already = await this.prisma.stockMovement.count({ where: { tenantId, refType: 'Invoice', refId: invoiceId, type: 'OUT' } });
    if (already > 0) return { skipped: 'already' };

    const lines = await this.prisma.invoiceLine.findMany({
      where: { invoiceId, stockItemId: { not: null } },
      include: { stockItem: { select: { id: true, avgCostHt: true } } },
    });
    let deducted = 0;
    for (const l of lines) {
      const itemId = l.stockItemId!;
      const want = n(l.quantity);
      await this.prisma.$transaction(async (tx) => {
        const level = await tx.stockLevel.findUnique({ where: { itemId_locationId: { itemId, locationId } } });
        const current = n(level?.quantity);
        const qty = Math.min(want, current);
        if (qty <= 0) return;
        await this.setLevelT(tx, tenantId, itemId, locationId, current - qty);
        await tx.stockMovement.create({
          data: {
            tenantId, itemId, locationId, type: 'OUT', quantity: qty,
            unitCostHt: n(l.stockItem?.avgCostHt), reason: 'Vente (facture)',
            refType: 'Invoice', refId: invoiceId,
          },
        });
        deducted++;
      });
    }
    return { deducted };
  }

  // Restitution si la facture est annulee (reverse les sorties faites a
  // l'emission). Idempotent (ne restitue pas deux fois).
  async restoreForInvoice(tenantId: string | null, invoiceId: string) {
    const outs = await this.prisma.stockMovement.findMany({ where: { tenantId, refType: 'Invoice', refId: invoiceId, type: 'OUT' } });
    if (outs.length === 0) return { skipped: 'nothing' };
    const ins = await this.prisma.stockMovement.count({ where: { tenantId, refType: 'Invoice', refId: invoiceId, type: 'IN' } });
    if (ins > 0) return { skipped: 'already-restored' };
    for (const m of outs) {
      await this.prisma.$transaction(async (tx) => {
        const level = await tx.stockLevel.findUnique({ where: { itemId_locationId: { itemId: m.itemId, locationId: m.locationId } } });
        await this.setLevelT(tx, tenantId, m.itemId, m.locationId, n(level?.quantity) + n(m.quantity));
        await tx.stockMovement.create({
          data: {
            tenantId, itemId: m.itemId, locationId: m.locationId, type: 'IN', quantity: n(m.quantity),
            unitCostHt: n(m.unitCostHt), reason: 'Annulation facture', refType: 'Invoice', refId: invoiceId,
          },
        });
      });
    }
    return { restored: outs.length };
  }

  // ---------------- Reservation sur devis ----------------
  // Cree des reservations ACTIVE pour les lignes du devis liees a un article de
  // stock. Reduit le stock DISPONIBLE (= physique - reserve) sans toucher au
  // physique. Idempotent (ne re-reserve pas si des reservations ACTIVE existent).
  async reserveForQuote(tenantId: string | null, quoteId: string) {
    const active = await this.prisma.stockReservation.count({ where: { tenantId, quoteId, status: 'ACTIVE' } });
    if (active > 0) return { skipped: 'already' };
    const lines = await this.prisma.quoteLine.findMany({
      where: { quoteId, stockItemId: { not: null } },
      select: { stockItemId: true, quantity: true },
    });
    if (lines.length === 0) return { reserved: 0 };
    await this.prisma.stockReservation.createMany({
      data: lines.map((l) => ({
        tenantId, itemId: l.stockItemId as string, quoteId, quantity: l.quantity, status: 'ACTIVE' as const,
      })),
    });
    return { reserved: lines.length };
  }

  // Libere (RELEASED) les reservations ACTIVE d'un devis : refus, expiration,
  // conversion en contrat (le decrement physique reel se fera a la facturation).
  // Idempotent.
  async releaseForQuote(tenantId: string | null, quoteId: string) {
    const r = await this.prisma.stockReservation.updateMany({
      where: { tenantId, quoteId, status: 'ACTIVE' },
      data: { status: 'RELEASED', releasedAt: new Date() },
    });
    return { released: r.count };
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
    if (dto.assetId) await this.assertOwned('asset', dto.assetId, me);
    return this.prisma.stockSerial.update({ where: { id }, data: dto as any });
  }

  // ---------------- Consommation sur intervention (decrement) ----------------
  // Decremente le stock a un emplacement et trace la pose chez le client via
  // un mouvement OUT rattache a l'intervention. Accessible a tout utilisateur
  // du tenant (le technicien qui pose le materiel).
  async consume(me: JwtUser, dto: ConsumeDto) {
    const item = await this.assertOwned('stockItem', dto.itemId, me);
    await this.assertOwned('stockLocation', dto.locationId, me);
    await this.assertOwned('intervention', dto.interventionId, me);

    return this.prisma.$transaction(async (tx) => {
      const level = await tx.stockLevel.findUnique({ where: { itemId_locationId: { itemId: dto.itemId, locationId: dto.locationId } } });
      const current = n(level?.quantity);
      if (current < dto.quantity) throw new BadRequestException(`Stock insuffisant (${current} dispo sur cet emplacement)`);
      const unitCost = n(item.avgCostHt);
      await this.setLevel(tx, me, dto.itemId, dto.locationId, current - dto.quantity);
      await tx.stockMovement.create({
        data: {
          tenantId: me.tenantId, itemId: dto.itemId, locationId: dto.locationId, type: 'OUT',
          quantity: dto.quantity, unitCostHt: unitCost, reason: 'Consomme sur intervention',
          refType: 'Intervention', refId: dto.interventionId, performedById: me.id,
        },
      });
      return tx.stockConsumption.create({
        data: {
          tenantId: me.tenantId, interventionId: dto.interventionId, itemId: dto.itemId,
          locationId: dto.locationId, quantity: dto.quantity, unitCostHt: unitCost, createdById: me.id,
        },
        include: { item: { select: { id: true, sku: true, name: true, unit: true } }, location: { select: { id: true, name: true } } },
      });
    });
  }

  async listConsumptions(me: JwtUser, interventionId: string) {
    const rows = await this.prisma.stockConsumption.findMany({
      where: this.scope.scopedWhere(me, { interventionId }),
      include: { item: { select: { id: true, sku: true, name: true, unit: true } }, location: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({ ...r, quantity: n(r.quantity), unitCostHt: n(r.unitCostHt), totalHt: n(r.quantity) * n(r.unitCostHt) }));
  }

  // Suppression d'une consommation = restitution du stock (mouvement IN).
  async deleteConsumption(me: JwtUser, id: string) {
    const c = await this.prisma.stockConsumption.findFirst({ where: this.scope.scopedWhere(me, { id }) });
    if (!c) throw new NotFoundException('Consommation introuvable');
    return this.prisma.$transaction(async (tx) => {
      const level = await tx.stockLevel.findUnique({ where: { itemId_locationId: { itemId: c.itemId, locationId: c.locationId } } });
      await this.setLevel(tx, me, c.itemId, c.locationId, n(level?.quantity) + n(c.quantity));
      await tx.stockMovement.create({
        data: {
          tenantId: me.tenantId, itemId: c.itemId, locationId: c.locationId, type: 'IN',
          quantity: n(c.quantity), unitCostHt: n(c.unitCostHt), reason: 'Annulation consommation intervention',
          refType: 'Intervention', refId: c.interventionId, performedById: me.id,
        },
      });
      await tx.stockConsumption.delete({ where: { id } });
      return { ok: true };
    });
  }

  // ---------------- Reappro ----------------
  // Suggestions de reappro : articles sous leur seuil, groupes par fournisseur,
  // avec une quantite suggeree pour repasser au-dessus du seuil (cible = 2x le
  // seuil par defaut). Utilise par l'UI et la generation de brouillons de commande.
  async reorderSuggestions(me: JwtUser) {
    const items = await this.listItems(me);
    const low = items.filter((i) => i.lowStock);
    const bySupplier = new Map<string | null, { supplierId: string | null; supplierName: string | null; lines: any[] }>();
    for (const i of low) {
      const sid = i.supplierId ?? null;
      const target = Math.max(2 * i.reorderPoint, i.reorderPoint + 1);
      const suggestedQty = Math.max(Math.ceil(target - i.totalQty), 1);
      if (!bySupplier.has(sid)) bySupplier.set(sid, { supplierId: sid, supplierName: i.supplier?.name ?? null, lines: [] });
      bySupplier.get(sid)!.lines.push({
        itemId: i.id, sku: i.sku, name: i.name, unit: i.unit,
        totalQty: i.totalQty, reorderPoint: i.reorderPoint, suggestedQty, unitCostHt: i.avgCostHt,
      });
    }
    return Array.from(bySupplier.values());
  }

  // Articles sous seuil pour un tenant donne (usage cron, sans JwtUser).
  async lowStockForTenant(tenantId: string) {
    const items = await this.prisma.stockItem.findMany({
      where: { tenantId, active: true },
      include: { levels: true, supplier: { select: { id: true, name: true } } },
    });
    return items.map((it) => this.decorate(it)).filter((i) => i.lowStock);
  }

  // Commandes fournisseurs en retard (date de livraison attendue depassee).
  overduePos(where: Prisma.PurchaseOrderWhereInput) {
    return this.prisma.purchaseOrder.findMany({
      where: { ...where, status: { in: ['ORDERED', 'PARTIAL'] }, expectedDate: { not: null, lt: new Date() } },
      include: { supplier: { select: { name: true } } },
      orderBy: { expectedDate: 'asc' },
    });
  }

  // ---------------- Export ----------------
  // Inventaire valorise (1 ligne par article, agrege tous emplacements). CSV
  // avec BOM UTF-8 + separateur ';' (Excel FR).
  async exportInventoryCsv(me: JwtUser): Promise<string> {
    const items = await this.listItems(me);
    const out = ['SKU;Nom;Categorie;Fournisseur;Quantite;Unite;PMP HT;Valeur HT'];
    for (const i of items) {
      out.push([
        csvEscape(i.sku), csvEscape(i.name), csvEscape(i.category ?? ''),
        csvEscape(i.supplier?.name ?? ''), String(i.totalQty), csvEscape(i.unit ?? ''),
        i.avgCostHt.toFixed(2), i.stockValue.toFixed(2),
      ].join(';'));
    }
    return '﻿' + out.join('\n');
  }

  // ---------------- Dashboard / alertes ----------------
  async dashboard(me: JwtUser) {
    const items = await this.listItems(me);
    const lowStock = items.filter((i) => i.lowStock);
    const stockValue = items.reduce((s, i) => s + i.stockValue, 0);
    const [locations, suppliers, openPo, overduePo, recentMovements] = await Promise.all([
      this.prisma.stockLocation.count({ where: this.scope.scopedWhere(me, { active: true }) }),
      this.prisma.supplier.count({ where: this.scope.scopedWhere(me, { active: true }) }),
      this.prisma.purchaseOrder.count({ where: this.scope.scopedWhere(me, { status: { in: ['ORDERED', 'PARTIAL'] } }) }),
      this.overduePos(this.scope.scopedWhere(me)),
      this.listMovements(me, undefined, 8),
    ]);
    return {
      itemCount: items.length,
      lowStockCount: lowStock.length,
      stockValueHt: Number(stockValue.toFixed(2)),
      locationCount: locations,
      supplierCount: suppliers,
      openPoCount: openPo,
      overduePoCount: overduePo.length,
      overduePos: overduePo.slice(0, 20).map((p) => ({
        id: p.id, reference: p.reference, supplierName: p.supplier?.name ?? null,
        expectedDate: p.expectedDate, status: p.status,
      })),
      lowStock: lowStock.slice(0, 20).map((i) => ({ id: i.id, sku: i.sku, name: i.name, totalQty: i.totalQty, reorderPoint: i.reorderPoint, unit: i.unit })),
      recentMovements,
    };
  }

  // Verifie l'appartenance au tenant d'une entite et la renvoie.
  private async assertOwned(model: 'stockItem' | 'stockLocation' | 'supplier' | 'stockSerial' | 'product' | 'asset' | 'intervention', id: string, me: JwtUser): Promise<any> {
    const where = this.scope.scopedWhere(me, { id });
    const e = await (this.prisma as any)[model].findFirst({ where });
    if (!e) throw new NotFoundException('Element introuvable dans ce tenant');
    return e;
  }
}
