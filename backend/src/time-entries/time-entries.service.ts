import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { differenceInMinutes } from 'date-fns';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly scope: TenantScope,
  ) {}

  // Resout le taux horaire facturable a appliquer a une entree au moment du stop.
  // Cascade : 1. taux deja saisi, 2. taux du contrat (TODO si on l'ajoute au
  // model), 3. taux par defaut user (User.hourlyRate, c'est le COUT pas le prix
  // de vente cf commentaire schema), 4. defaut global Settings 'profitability.
  // defaultBillingRate'. Sans ce fallback, les entries restaient sans tarif
  // et n'apparaissaient pas dans les exports facturation.
  private async resolveBillingRate(params: {
    userId: string;
    contractId: string | null;
  }): Promise<number | null> {
    if (params.contractId) {
      // Pour l'instant, le model Contract n'a pas de hourlyRate (la facturation
      // au temps passe est hors-forfait, donc le rate vient du settings global).
      // Si plus tard on ajoute Contract.hourlyRateHt, le lire ici.
    }
    const fromSettings = await this.settings.get('profitability.defaultBillingRate');
    if (fromSettings) {
      const n = parseFloat(fromSettings);
      if (!isNaN(n) && n > 0) return n;
    }
    return null;
  }

  // Demarrer un timer (endedAt=null jusqu'a stop)
  async startTimer(
    userId: string,
    body: { ticketId?: string; interventionId?: string; description?: string },
    tenantId: string | null,
  ) {
    // Stopper d'eventuels timers en cours pour cet utilisateur
    await this.stopAllRunning(userId);
    return this.prisma.timeEntry.create({
      data: {
        userId,
        startedAt: new Date(),
        ticketId: body.ticketId,
        interventionId: body.interventionId,
        description: body.description,
        tenantId: tenantId ?? undefined,
      },
    });
  }

  // Stopper le timer en cours. `idleMinutes` permet au frontend de "rendre" du
  // temps quand il a detecte de l'inactivite : si le user etait idle 20 min
  // pendant la session, on les soustrait de la duree facturable.
  async stopTimer(userId: string, opts: { idleMinutes?: number } = {}) {
    const running = await this.prisma.timeEntry.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!running) throw new NotFoundException('Aucun timer en cours');
    const ended = new Date();
    const elapsed = differenceInMinutes(ended, running.startedAt);
    // On soustrait l'idle au plafond de la duree mesuree (jamais negatif).
    const idle = Math.max(0, Math.min(opts.idleMinutes ?? 0, elapsed));
    const minutes = elapsed - idle;
    // Auto-resolution du taux facturable si pas deja saisi : evite que les
    // entries soient ignorees par les exports facturation.
    const data: Prisma.TimeEntryUpdateInput = { endedAt: ended, durationMin: minutes };
    if (running.hourlyRateHt == null) {
      const rate = await this.resolveBillingRate({
        userId,
        contractId: running.contractId,
      });
      if (rate != null) data.hourlyRateHt = rate;
    }
    return this.prisma.timeEntry.update({ where: { id: running.id }, data });
  }

  async currentTimer(userId: string) {
    return this.prisma.timeEntry.findFirst({
      where: { userId, endedAt: null },
      include: {
        ticket: { select: { id: true, reference: true, title: true } },
        intervention: { select: { id: true, title: true } },
      },
    });
  }

  async create(userId: string, dto: CreateTimeEntryDto, tenantId: string | null) {
    const startedAt = new Date(dto.startedAt);
    const endedAt = dto.endedAt ? new Date(dto.endedAt) : null;
    let duration = dto.durationMin;
    if (!duration && endedAt) duration = differenceInMinutes(endedAt, startedAt);
    if (!duration && !endedAt) {
      throw new BadRequestException('endedAt ou durationMin requis');
    }
    return this.prisma.timeEntry.create({
      data: {
        userId,
        startedAt,
        endedAt,
        durationMin: duration,
        description: dto.description,
        billable: dto.billable ?? true,
        hourlyRateHt: dto.hourlyRateHt,
        companyId: dto.companyId,
        ticketId: dto.ticketId,
        interventionId: dto.interventionId,
        contractId: dto.contractId,
        tenantId: tenantId ?? undefined,
      },
    });
  }

  async update(id: string, userId: string, dto: UpdateTimeEntryDto) {
    const existing = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    if (existing.userId !== userId) {
      throw new BadRequestException('Vous ne pouvez modifier que vos propres entrees');
    }
    const data: Prisma.TimeEntryUpdateInput = { ...dto } as any;
    if (dto.startedAt) data.startedAt = new Date(dto.startedAt);
    if (dto.endedAt) data.endedAt = new Date(dto.endedAt);
    if (dto.startedAt && dto.endedAt) {
      data.durationMin = differenceInMinutes(new Date(dto.endedAt), new Date(dto.startedAt));
    }
    return this.prisma.timeEntry.update({ where: { id }, data });
  }

  async remove(id: string, userId: string, userRole: string) {
    const existing = await this.prisma.timeEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    if (existing.userId !== userId && userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      throw new BadRequestException('Suppression non autorisee');
    }
    await this.prisma.timeEntry.delete({ where: { id } });
    return { success: true };
  }

  async findAll(
    params: {
      userId?: string;
      ticketId?: string;
      interventionId?: string;
      contractId?: string;
      from?: string;
      to?: string;
    },
    tenantId: string | null,
  ) {
    const where: Prisma.TimeEntryWhereInput = { tenantId };
    if (params.userId) where.userId = params.userId;
    if (params.ticketId) where.ticketId = params.ticketId;
    if (params.interventionId) where.interventionId = params.interventionId;
    if (params.contractId) where.contractId = params.contractId;
    if (params.from || params.to) {
      where.startedAt = {};
      if (params.from) (where.startedAt as any).gte = new Date(params.from);
      if (params.to) (where.startedAt as any).lte = new Date(params.to);
    }
    return this.prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        ticket: { select: { id: true, reference: true, title: true } },
        intervention: { select: { id: true, title: true } },
        contract: { select: { id: true, reference: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  // Cumuls : par utilisateur, par ticket, par client (sur une periode)
  async summary(params: { from?: string; to?: string; userId?: string }, me: JwtUser) {
    // Scope tenant : sinon un user pouvait voir les cumuls de temps de tous
    // les tenants (volume d'heures, identite des consultants, etc.).
    const extra: Prisma.TimeEntryWhereInput = { endedAt: { not: null } };
    if (params.userId) extra.userId = params.userId;
    if (params.from || params.to) {
      extra.startedAt = {};
      if (params.from) (extra.startedAt as any).gte = new Date(params.from);
      if (params.to) (extra.startedAt as any).lte = new Date(params.to);
    }
    const where = this.scope.scopedWhere(me, extra) as Prisma.TimeEntryWhereInput;
    const entries = await this.prisma.timeEntry.findMany({
      where,
      select: {
        durationMin: true,
        billable: true,
        userId: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    const totalMin = entries.reduce((s, e) => s + (e.durationMin ?? 0), 0);
    const billableMin = entries.filter((e) => e.billable).reduce((s, e) => s + (e.durationMin ?? 0), 0);
    const byUser: Record<string, { name: string; totalMin: number; billableMin: number }> = {};
    for (const e of entries) {
      if (!byUser[e.userId]) {
        byUser[e.userId] = {
          name: e.user.firstName + ' ' + e.user.lastName,
          totalMin: 0,
          billableMin: 0,
        };
      }
      byUser[e.userId].totalMin += e.durationMin ?? 0;
      if (e.billable) byUser[e.userId].billableMin += e.durationMin ?? 0;
    }
    return {
      totalMin,
      billableMin,
      nonBillableMin: totalMin - billableMin,
      byUser: Object.entries(byUser).map(([userId, v]) => ({ userId, ...v })),
    };
  }

  private async stopAllRunning(userId: string) {
    const list = await this.prisma.timeEntry.findMany({
      where: { userId, endedAt: null },
    });
    const now = new Date();
    for (const t of list) {
      await this.prisma.timeEntry.update({
        where: { id: t.id },
        data: {
          endedAt: now,
          durationMin: differenceInMinutes(now, t.startedAt),
        },
      });
    }
  }

  // ============================================================
  // FACTURATION DU TEMPS (admin)
  // ============================================================
  // Resolveur de companyId effectif d'une entree : direct si TimeEntry.companyId,
  // sinon via ticket.companyId, sinon intervention.companyId, sinon contract.companyId.
  // Retourne null si l'entree est totalement non rattachee (pause, admin interne).
  private resolveCompanyId(e: {
    companyId: string | null;
    ticket: { companyId: string } | null;
    intervention: { companyId: string } | null;
    contract: { companyId: string } | null;
  }): string | null {
    return e.companyId
      ?? e.ticket?.companyId
      ?? e.intervention?.companyId
      ?? e.contract?.companyId
      ?? null;
  }

  /**
   * Agregat de facturation : pour chaque societe, total d'heures billable
   * sur la periode, montant HT estime, statut facture/non facture.
   */
  async billingByCompany(params: { from: string; to: string; onlyUnbilled?: boolean }, me: JwtUser) {
    // Scope tenant : sans, un MANAGER pouvait voir les heures facturables et
    // CA estime de tous les autres tenants (data business sensible).
    const extra: Prisma.TimeEntryWhereInput = {
      endedAt: { not: null },
      billable: true,
      startedAt: { gte: new Date(params.from), lte: new Date(params.to) },
    };
    if (params.onlyUnbilled) extra.invoicedAt = null;
    const where = this.scope.scopedWhere(me, extra) as Prisma.TimeEntryWhereInput;

    const entries = await this.prisma.timeEntry.findMany({
      where,
      include: {
        ticket: { select: { id: true, reference: true, companyId: true } },
        intervention: { select: { id: true, title: true, companyId: true } },
        contract: { select: { id: true, reference: true, companyId: true } },
      },
    });

    // Recupere les noms de societes en un seul findMany
    const companyIds = new Set<string>();
    for (const e of entries) {
      const cid = this.resolveCompanyId(e);
      if (cid) companyIds.add(cid);
    }
    const companies = await this.prisma.company.findMany({
      where: { id: { in: Array.from(companyIds) } },
      select: { id: true, name: true },
    });
    const companyMap = new Map(companies.map((c) => [c.id, c.name]));

    const buckets = new Map<string, {
      companyId: string | null;
      companyName: string;
      totalMin: number;
      billedMin: number;
      unbilledMin: number;
      estimatedHt: number;
      entries: number;
    }>();
    const NO_COMPANY = '__none__';

    for (const e of entries) {
      const cid = this.resolveCompanyId(e);
      const key = cid ?? NO_COMPANY;
      if (!buckets.has(key)) {
        buckets.set(key, {
          companyId: cid,
          companyName: cid ? (companyMap.get(cid) ?? 'Inconnu') : 'Non rattache',
          totalMin: 0,
          billedMin: 0,
          unbilledMin: 0,
          estimatedHt: 0,
          entries: 0,
        });
      }
      const b = buckets.get(key)!;
      const minutes = e.durationMin ?? 0;
      b.totalMin += minutes;
      b.entries += 1;
      if (e.invoicedAt) b.billedMin += minutes;
      else b.unbilledMin += minutes;
      const rate = e.hourlyRateHt ? Number(e.hourlyRateHt) : 0;
      b.estimatedHt += (minutes / 60) * rate;
    }

    return Array.from(buckets.values()).sort((a, b) => b.totalMin - a.totalMin);
  }

  /** Detail des entries facturables d'une societe sur une periode. */
  async billingDetail(params: { companyId: string; from: string; to: string; onlyUnbilled?: boolean }, me: JwtUser) {
    await this.scope.assertCompanyInTenant(params.companyId, me);
    const extra: Prisma.TimeEntryWhereInput = {
      endedAt: { not: null },
      billable: true,
      startedAt: { gte: new Date(params.from), lte: new Date(params.to) },
      OR: [
        { companyId: params.companyId },
        { ticket: { companyId: params.companyId } },
        { intervention: { companyId: params.companyId } },
        { contract: { companyId: params.companyId } },
      ],
    };
    if (params.onlyUnbilled) extra.invoicedAt = null;
    const where = this.scope.scopedWhere(me, extra) as Prisma.TimeEntryWhereInput;
    return this.prisma.timeEntry.findMany({
      where,
      orderBy: { startedAt: 'asc' },
      include: {
        user: { select: { firstName: true, lastName: true } },
        ticket: { select: { reference: true, title: true } },
        intervention: { select: { title: true } },
        contract: { select: { reference: true } },
      },
    });
  }

  /** Marque une liste d'entries comme facturees (ex. apres envoi vers Qonto). */
  async markInvoiced(ids: string[], invoicerId: string, invoiceReference?: string) {
    if (ids.length === 0) return { updated: 0 };
    const r = await this.prisma.timeEntry.updateMany({
      where: { id: { in: ids }, invoicedAt: null },
      data: {
        invoicedAt: new Date(),
        invoicedById: invoicerId,
        invoiceReference: invoiceReference ?? null,
      },
    });
    return { updated: r.count };
  }

  async unmarkInvoiced(ids: string[]) {
    if (ids.length === 0) return { updated: 0 };
    const r = await this.prisma.timeEntry.updateMany({
      where: { id: { in: ids } },
      data: { invoicedAt: null, invoicedById: null, invoiceReference: null },
    });
    return { updated: r.count };
  }

  /** Export CSV des entries facturables d'une societe (importable dans Qonto). */
  async exportCsv(params: { companyId: string; from: string; to: string; onlyUnbilled?: boolean }, me: JwtUser): Promise<string> {
    const items = await this.billingDetail(params, me);
    const lines: string[] = [];
    // En-tete CSV (UTF-8 avec BOM pour Excel FR)
    lines.push('Date;Duree (h);Description;Reference;Technicien;Taux HT;Montant HT');
    for (const e of items) {
      const date = e.startedAt.toISOString().slice(0, 10);
      const hours = ((e.durationMin ?? 0) / 60).toFixed(2);
      const desc = csvEscape(
        e.description
        ?? e.ticket?.title
        ?? e.intervention?.title
        ?? 'Prestation',
      );
      const ref = csvEscape(e.ticket?.reference ?? e.contract?.reference ?? '');
      const tech = csvEscape(e.user.firstName + ' ' + e.user.lastName);
      const rate = e.hourlyRateHt ? Number(e.hourlyRateHt).toFixed(2) : '';
      const amount = e.hourlyRateHt ? ((Number(e.hourlyRateHt) * (e.durationMin ?? 0)) / 60).toFixed(2) : '';
      lines.push([date, hours, desc, ref, tech, rate, amount].join(';'));
    }
    return '﻿' + lines.join('\n');
  }
}

function csvEscape(s: string): string {
  if (s.includes(';') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
