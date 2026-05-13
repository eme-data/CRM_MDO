import { Injectable } from '@nestjs/common';
import { subDays } from 'date-fns';
import { PrismaService } from '../database/prisma.service';

// Service derriere la page status publique. N'expose QUE les monitors marques
// `isPublic = true` (typiquement les services internes MDO Services, jamais
// ceux de clients). Aucune URL n'est renvoyee — seulement nom + statut.

export interface PublicStatusItem {
  name: string;
  status: 'OPERATIONAL' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
  uptime30dPct: number | null;
  responseMs: number | null;
}

export interface PublicStatusOverview {
  overall: 'OPERATIONAL' | 'DEGRADED' | 'DOWN';
  items: PublicStatusItem[];
  lastIncident: { startedAt: string; resolvedAt: string | null; daysAgo: number } | null;
  updatedAt: string;
}

@Injectable()
export class StatusService {
  constructor(private readonly prisma: PrismaService) {}

  async publicOverview(): Promise<PublicStatusOverview> {
    const monitors = await this.prisma.uptimeMonitor.findMany({
      where: { isPublic: true, enabled: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        lastStatus: true,
        lastResponseMs: true,
        consecutiveFailures: true,
      },
    });

    const now = new Date();
    const since30d = subDays(now, 30);

    const items: PublicStatusItem[] = [];
    for (const m of monitors) {
      // Calcul uptime sur 30 jours a partir des checks individuels
      const [upCount, downCount] = await Promise.all([
        this.prisma.uptimeCheck.count({
          where: { monitorId: m.id, checkedAt: { gte: since30d }, isUp: true },
        }),
        this.prisma.uptimeCheck.count({
          where: { monitorId: m.id, checkedAt: { gte: since30d }, isUp: false },
        }),
      ]);
      const total = upCount + downCount;
      const uptime30dPct = total > 0 ? (upCount / total) * 100 : null;

      let status: PublicStatusItem['status'] = 'UNKNOWN';
      if (m.lastStatus === 'UP') {
        status = uptime30dPct !== null && uptime30dPct < 99 ? 'DEGRADED' : 'OPERATIONAL';
      } else if (m.lastStatus === 'DOWN') {
        status = 'DOWN';
      }

      items.push({
        name: m.name,
        status,
        uptime30dPct,
        responseMs: m.lastResponseMs,
      });
    }

    // Statut global = pire des statuts individuels
    let overall: PublicStatusOverview['overall'] = 'OPERATIONAL';
    if (items.some((i) => i.status === 'DOWN')) overall = 'DOWN';
    else if (items.some((i) => i.status === 'DEGRADED')) overall = 'DEGRADED';

    // Dernier incident resolu (sans details, juste pour transparence)
    const lastIncident = await this.prisma.uptimeIncident.findFirst({
      where: { monitor: { isPublic: true } },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true, endedAt: true },
    });

    return {
      overall,
      items,
      lastIncident: lastIncident ? {
        startedAt: lastIncident.startedAt.toISOString(),
        resolvedAt: lastIncident.endedAt?.toISOString() ?? null,
        daysAgo: Math.floor((now.getTime() - lastIncident.startedAt.getTime()) / (24 * 3600 * 1000)),
      } : null,
      updatedAt: now.toISOString(),
    };
  }
}
