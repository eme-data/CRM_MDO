import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

// Calcule un statut lifecycle par asset matriciel a partir des dates :
//  - HEALTHY              : sous garantie + sous support
//  - WARRANTY_EXPIRING    : garantie expire dans <= 90j
//  - OUT_OF_WARRANTY      : garantie passee mais pas EOSL
//  - SUPPORT_ENDING       : EOSL dans <= 6 mois
//  - EOSL                 : depasse la date de fin de support — risque NIS2
//  - NEEDS_REPLACEMENT    : EOSL ET hors garantie (les deux)
//  - UNKNOWN              : pas assez de dates pour decider

export type LifecycleStatus =
  | 'HEALTHY'
  | 'WARRANTY_EXPIRING'
  | 'OUT_OF_WARRANTY'
  | 'SUPPORT_ENDING'
  | 'EOSL'
  | 'NEEDS_REPLACEMENT'
  | 'UNKNOWN';

export interface AssetWithLifecycle {
  id: string;
  name: string;
  type: string;
  vendor: string | null;
  model: string | null;
  warrantyUntil: Date | null;
  supportEndDate: Date | null;
  acquiredAt: Date | null;
  replacementBudgetHt: number | null;
  company: { id: string; name: string };
  lifecycle: {
    status: LifecycleStatus;
    daysToWarrantyEnd: number | null;
    daysToSupportEnd: number | null;
    ageMonths: number | null;
  };
}

@Injectable()
export class AssetLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
  ) {}

  private classify(asset: { warrantyUntil: Date | null; supportEndDate: Date | null }): LifecycleStatus {
    const now = Date.now();
    const w = asset.warrantyUntil?.getTime() ?? null;
    const s = asset.supportEndDate?.getTime() ?? null;
    if (w === null && s === null) return 'UNKNOWN';
    const dayMs = 86400_000;
    const wDays = w !== null ? Math.floor((w - now) / dayMs) : null;
    const sDays = s !== null ? Math.floor((s - now) / dayMs) : null;

    const warrantyOver = wDays !== null && wDays < 0;
    const supportOver = sDays !== null && sDays < 0;
    if (warrantyOver && supportOver) return 'NEEDS_REPLACEMENT';
    if (supportOver) return 'EOSL';
    if (sDays !== null && sDays <= 180) return 'SUPPORT_ENDING';
    if (warrantyOver) return 'OUT_OF_WARRANTY';
    if (wDays !== null && wDays <= 90) return 'WARRANTY_EXPIRING';
    return 'HEALTHY';
  }

  private enrich(a: any): AssetWithLifecycle {
    const status = this.classify(a);
    const dayMs = 86400_000;
    const now = Date.now();
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      vendor: a.vendor,
      model: a.model,
      warrantyUntil: a.warrantyUntil,
      supportEndDate: a.supportEndDate,
      acquiredAt: a.acquiredAt,
      replacementBudgetHt: a.replacementBudgetHt ? Number(a.replacementBudgetHt) : null,
      company: a.company,
      lifecycle: {
        status,
        daysToWarrantyEnd: a.warrantyUntil ? Math.floor((a.warrantyUntil.getTime() - now) / dayMs) : null,
        daysToSupportEnd: a.supportEndDate ? Math.floor((a.supportEndDate.getTime() - now) / dayMs) : null,
        ageMonths: a.acquiredAt ? Math.floor((now - a.acquiredAt.getTime()) / (dayMs * 30)) : null,
      },
    };
  }

  async overview(me: JwtUser, params: { companyId?: string; status?: LifecycleStatus } = {}) {
    // Scope tenant : sans, un user listait les assets HARDWARE de tous les
    // clients de tous les tenants (inventaire complet exfile).
    const extra: Prisma.AssetWhereInput = {
      type: 'HARDWARE',
      status: 'ACTIVE',
    };
    if (params.companyId) {
      await this.scope.assertCompanyInTenant(params.companyId, me);
      extra.companyId = params.companyId;
    }
    const assets = await this.prisma.asset.findMany({
      where: this.scope.scopedWhere(me, extra),
      include: { company: { select: { id: true, name: true } } },
      orderBy: [{ supportEndDate: 'asc' }, { warrantyUntil: 'asc' }],
    });
    let enriched = assets.map((a) => this.enrich(a));
    if (params.status) {
      enriched = enriched.filter((a) => a.lifecycle.status === params.status);
    }
    return enriched;
  }

  async stats(me: JwtUser) {
    const all = await this.overview(me);
    const counts: Record<LifecycleStatus, number> = {
      HEALTHY: 0, WARRANTY_EXPIRING: 0, OUT_OF_WARRANTY: 0,
      SUPPORT_ENDING: 0, EOSL: 0, NEEDS_REPLACEMENT: 0, UNKNOWN: 0,
    };
    let totalReplacementBudget = 0;
    let assetsToReplace = 0;
    for (const a of all) {
      counts[a.lifecycle.status]++;
      if (['EOSL', 'NEEDS_REPLACEMENT', 'SUPPORT_ENDING'].includes(a.lifecycle.status)) {
        assetsToReplace++;
        if (a.replacementBudgetHt) totalReplacementBudget += a.replacementBudgetHt;
      }
    }
    return {
      total: all.length,
      counts,
      assetsToReplace,
      estimatedReplacementBudgetHt: +totalReplacementBudget.toFixed(2),
    };
  }
}
