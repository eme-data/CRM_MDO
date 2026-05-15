import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ContractStatus, ContractOffer } from '@prisma/client';
import { addDays, differenceInDays, startOfDay } from 'date-fns';
import { PrismaService } from '../database/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { RenewContractDto } from './dto/renew-contract.dto';
import { QueryContractsDto } from './dto/query-contracts.dto';
import { buildPageResult, toSkipTake } from '../common/pagination/pagination.dto';
import { OnboardingService } from '../onboarding/onboarding.service';
import { CacheService } from '../common/cache/cache.service';
import { withUniqueRetry } from '../common/db/unique-retry';

const OFFER_UNIT_PRICES: Record<ContractOffer, number> = {
  MDO_ESSENTIEL: 69,
  MDO_PRO: 99,
  MDO_SOUVERAIN: 139,
  CUSTOM: 0,
};

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);
  private readonly alertDays: number[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly onboarding: OnboardingService,
    private readonly cache: CacheService,
  ) {
    this.alertDays = this.configService.get<number[]>('contract.alertDays') ?? [90, 60, 30, 7];
  }

  // Toute mutation de contrat invalide les agregats cachs : MRR/ARR exec et
  // marge par client. Sans ca, un nouveau contrat n'apparait dans le dashboard
  // dirigeant qu'apres expiration du TTL (1h) — incoherence visible.
  private invalidateAggregates(companyId?: string) {
    this.cache.del('executive:snapshot');
    if (companyId) this.cache.invalidatePrefix('profitability:' + companyId);
    else this.cache.invalidatePrefix('profitability:');
  }

  async generateReference(tenantId: string | null): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `MDO-${year}-`;
    // Multi-tenant : sequence par tenant. Le prefixe "MDO-" est juste le format
    // par defaut MDO ; pour les tenants clients, on pourrait personnaliser via
    // Tenant.contractRefPrefix (TODO). Pour l'instant on reste sur "MDO-".
    const last = await this.prisma.contract.findFirst({
      where: { tenantId, reference: { startsWith: prefix } },
      orderBy: { reference: 'desc' },
      select: { reference: true },
    });
    let next = 1;
    if (last) {
      const match = last.reference.match(/(\d+)$/);
      if (match) next = parseInt(match[1], 10) + 1;
    }
    return `${prefix}${String(next).padStart(4, '0')}`;
  }

  async findAll(query: QueryContractsDto, tenantId: string | null) {
    const { skip, take, page, pageSize } = toSkipTake({
      page: query.page,
      pageSize: query.pageSize ?? 25,
    });

    const where: Prisma.ContractWhereInput = { tenantId };
    if (query.status) where.status = query.status;
    if (query.companyId) where.companyId = query.companyId;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { reference: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.expiringInDays != null) {
      where.status = 'ACTIVE';
      where.endDate = {
        gte: new Date(),
        lte: addDays(new Date(), query.expiringInDays),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        include: {
          company: { select: { id: true, name: true } },
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { endDate: 'asc' },
        skip,
        take,
      }),
      this.prisma.contract.count({ where }),
    ]);

    return buildPageResult(items, total, page, pageSize);
  }

  async findOne(id: string, tenantId: string | null) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, tenantId },
      include: {
        company: true,
        opportunity: true,
        owner: { select: { id: true, firstName: true, lastName: true } },
        previousContract: { select: { id: true, reference: true, endDate: true } },
        nextContract: { select: { id: true, reference: true, startDate: true } },
        alerts: { orderBy: { alertDate: 'asc' } },
      },
    });
    if (!contract) throw new NotFoundException('Contrat introuvable');
    return contract;
  }

  async create(dto: CreateContractDto, userId: string, tenantId: string | null) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end <= start) {
      throw new BadRequestException('La date de fin doit etre posterieure a la date de debut');
    }

    const quantity = dto.quantity ?? 1;
    const unitPrice =
      dto.unitPriceHt ?? OFFER_UNIT_PRICES[dto.offer ?? 'MDO_ESSENTIEL'] ?? 0;
    const monthlyAmountHt = unitPrice * quantity;

    // Retry anti-TOCTOU : la contrainte @unique sur Contract.reference fait
    // echouer en P2002 si 2 contrats sont crees en parallele avec le meme
    // numero. On recalcule alors le prochain libre.
    const contract = await withUniqueRetry(
      () => this.generateReference(tenantId),
      (reference) => this.prisma.$transaction(async (tx) => {
        const created = await tx.contract.create({
          data: {
            reference,
            title: dto.title,
            offer: dto.offer ?? 'MDO_ESSENTIEL',
            status: dto.status ?? 'DRAFT',
            startDate: start,
            endDate: end,
            signedAt: dto.signedAt ? new Date(dto.signedAt) : null,
            engagementMonths: dto.engagementMonths ?? 12,
            billingPeriod: dto.billingPeriod ?? 'MONTHLY',
            unitPriceHt: unitPrice,
            quantity,
            monthlyAmountHt,
            setupFeeHt: dto.setupFeeHt,
            vatRate: dto.vatRate ?? 20,
            autoRenew: dto.autoRenew ?? true,
            noticePeriodMonths: dto.noticePeriodMonths ?? 3,
            description: dto.description,
            companyId: dto.companyId,
            opportunityId: dto.opportunityId,
            ownerId: dto.ownerId ?? userId,
            tenantId: tenantId ?? undefined,
          },
        });

        await this.createAlertsForContract(tx as any, created.id, end);

        await tx.activity.create({
          data: {
            userId,
            action: 'CREATE',
            entity: 'Contract',
            entityId: created.id,
            metadata: { reference: created.reference, offer: created.offer },
          },
        });
        return created;
      }),
    );

    this.invalidateAggregates(contract.companyId);
    return contract;
  }

  async update(id: string, dto: UpdateContractDto, userId: string, tenantId: string | null) {
    const existing = await this.findOne(id, tenantId);
    const data: Prisma.ContractUpdateInput = { ...dto } as any;

    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.endDate) data.endDate = new Date(dto.endDate);
    if (dto.signedAt) data.signedAt = new Date(dto.signedAt);
    if (dto.terminatedAt) data.terminatedAt = new Date(dto.terminatedAt);

    if (dto.unitPriceHt != null || dto.quantity != null) {
      const unitPrice = dto.unitPriceHt ?? Number(existing.unitPriceHt);
      const qty = dto.quantity ?? existing.quantity;
      data.monthlyAmountHt = unitPrice * qty;
    }

    const endDateChanged =
      dto.endDate && new Date(dto.endDate).getTime() !== existing.endDate.getTime();

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.contract.update({ where: { id }, data });
      if (endDateChanged) {
        await tx.contractRenewalAlert.deleteMany({
          where: { contractId: id, sentAt: null },
        });
        await this.createAlertsForContract(tx as any, id, u.endDate);
      }
      await tx.activity.create({
        data: { userId, action: 'UPDATE', entity: 'Contract', entityId: id },
      });
      return u;
    });

    // Auto-trigger onboarding : si le contrat vient de passer DRAFT -> ACTIVE,
    // on cherche un template matchant l'offre et on demarre un run. Best-effort
    // (n'echoue pas l'update si pas de template configure).
    if (existing.status !== 'ACTIVE' && updated.status === 'ACTIVE') {
      this.onboarding
        .startForContract(updated.id)
        .catch((err) => this.logger.warn('Auto-onboarding skip pour ' + updated.id + ' : ' + err.message));
    }

    this.invalidateAggregates(existing.companyId);
    return updated;
  }

  async remove(id: string, userId: string, tenantId: string | null) {
    const existing = await this.findOne(id, tenantId);
    await this.prisma.$transaction(async (tx) => {
      await tx.contract.delete({ where: { id } });
      await tx.activity.create({
        data: { userId, action: 'DELETE', entity: 'Contract', entityId: id },
      });
    });
    this.invalidateAggregates(existing.companyId);
    return { success: true };
  }

  async terminate(id: string, reason: string, userId: string, tenantId: string | null) {
    const existing = await this.findOne(id, tenantId);
    const updated = await this.prisma.contract.update({
      where: { id },
      data: {
        status: 'TERMINATED',
        terminatedAt: new Date(),
        terminationReason: reason,
      },
    });
    await this.prisma.activity.create({
      data: { userId, action: 'TERMINATE', entity: 'Contract', entityId: id, metadata: { reason } },
    });
    this.invalidateAggregates(existing.companyId);
    return updated;
  }

  async renew(id: string, dto: RenewContractDto, userId: string, tenantId: string | null) {
    const previous = await this.findOne(id, tenantId);
    const quantity = dto.quantity ?? previous.quantity;
    const unitPrice = dto.unitPriceHt ?? Number(previous.unitPriceHt);
    const monthlyAmountHt = unitPrice * quantity;

    // Retry anti-TOCTOU sur reference (cf create()).
    const newContract = await withUniqueRetry(
      () => this.generateReference(tenantId),
      (reference) => this.prisma.$transaction(async (tx) => {
      const created = await tx.contract.create({
        data: {
          reference,
          title: previous.title + ' (renouvellement)',
          offer: previous.offer,
          status: 'ACTIVE',
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          signedAt: new Date(),
          engagementMonths: dto.engagementMonths ?? previous.engagementMonths,
          billingPeriod: previous.billingPeriod,
          unitPriceHt: unitPrice,
          quantity,
          monthlyAmountHt,
          vatRate: previous.vatRate,
          autoRenew: previous.autoRenew,
          noticePeriodMonths: previous.noticePeriodMonths,
          companyId: previous.companyId,
          opportunityId: previous.opportunityId,
          ownerId: previous.ownerId,
          previousContractId: previous.id,
          tenantId: tenantId ?? undefined,
        },
      });
      await tx.contract.update({
        where: { id: previous.id },
        data: { status: 'RENEWED' },
      });
      await this.createAlertsForContract(tx as any, created.id, created.endDate);
      await tx.activity.create({
        data: {
          userId,
          action: 'RENEW',
          entity: 'Contract',
          entityId: created.id,
          metadata: { previousId: previous.id, previousReference: previous.reference },
        },
      });
      return created;
      }),
    );

    this.invalidateAggregates(previous.companyId);
    return newContract;
  }

  private async createAlertsForContract(
    tx: PrismaService,
    contractId: string,
    endDate: Date,
  ) {
    const today = startOfDay(new Date());
    for (const daysBefore of this.alertDays) {
      const alertDate = addDays(endDate, -daysBefore);
      if (alertDate < today) continue;
      await tx.contractRenewalAlert.create({
        data: { contractId, daysBefore, alertDate },
      });
    }
  }

  async stats(tenantId: string | null) {
    const now = new Date();
    const in30 = addDays(now, 30);
    const in60 = addDays(now, 60);
    const in90 = addDays(now, 90);

    const [active, mrr, expiring30, expiring60, expiring90] = await Promise.all([
      this.prisma.contract.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.contract.aggregate({
        where: { tenantId, status: 'ACTIVE' },
        _sum: { monthlyAmountHt: true },
      }),
      this.prisma.contract.count({
        where: { tenantId, status: 'ACTIVE', endDate: { gte: now, lte: in30 } },
      }),
      this.prisma.contract.count({
        where: { tenantId, status: 'ACTIVE', endDate: { gte: now, lte: in60 } },
      }),
      this.prisma.contract.count({
        where: { tenantId, status: 'ACTIVE', endDate: { gte: now, lte: in90 } },
      }),
    ]);

    return {
      activeCount: active,
      mrrHt: Number(mrr._sum.monthlyAmountHt ?? 0),
      expiringIn30: expiring30,
      expiringIn60: expiring60,
      expiringIn90: expiring90,
    };
  }

  async expiringSoon(days = 90, tenantId: string | null = null) {
    const list = await this.prisma.contract.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        endDate: { gte: new Date(), lte: addDays(new Date(), days) },
      },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { endDate: 'asc' },
    });
    return list.map((c) => ({
      ...c,
      daysRemaining: differenceInDays(c.endDate, new Date()),
    }));
  }
}
