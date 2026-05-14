import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { collectDefaultMetrics, Gauge, register } from 'prom-client';
import { PrismaService } from '../../database/prisma.service';

// Refresh des gauges metier en tache de fond plutot qu'a chaque scrape Prometheus.
// Pourquoi : sans cache, chaque appel `/metrics` declenche un count() + groupBy()
// sur les tables Contract / Ticket / User. Avec un Prometheus qui scrape toutes
// les 15s sur 2 replicas, ca fait 8 reqs/min sur des tables qui peuvent croitre
// a >100k lignes. Le cron tourne lui aussi toutes les 30s mais une seule fois
// (pas par replica scrape).
//
// Note : si la BDD est down, on garde les dernieres valeurs connues plutot que
// de reset (mieux pour graph) ; les metriques systeme (event-loop, RSS, ...)
// continuent d'etre exposees par collectDefaultMetrics.

const REFRESH_INTERVAL_MS = 30_000;

let defaultsCollected = false;

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);

  readonly contractsActive: Gauge<string>;
  readonly ticketsOpen: Gauge<string>;
  readonly usersActive: Gauge<string>;
  readonly metricsRefreshErrors: Gauge<string>;
  readonly metricsLastRefreshAt: Gauge<string>;

  constructor(private readonly prisma: PrismaService) {
    if (!defaultsCollected) {
      collectDefaultMetrics({ prefix: 'crm_' });
      defaultsCollected = true;
    }
    this.contractsActive = this.gauge('crm_contracts_active', 'Contrats au statut ACTIVE');
    this.ticketsOpen = this.gauge(
      'crm_tickets_open',
      'Tickets ouverts (status != CLOSED), labelise par priority',
      ['priority'],
    );
    this.usersActive = this.gauge('crm_users_active', 'Utilisateurs actifs (isActive)');
    this.metricsRefreshErrors = this.gauge(
      'crm_metrics_refresh_errors_total',
      'Nombre cumule d echecs de refresh metier des metriques',
    );
    this.metricsLastRefreshAt = this.gauge(
      'crm_metrics_last_refresh_timestamp_seconds',
      'Timestamp Unix du dernier refresh OK',
    );
  }

  private gauge(name: string, help: string, labelNames: string[] = []): Gauge<string> {
    const existing = register.getSingleMetric(name) as Gauge<string> | undefined;
    if (existing) return existing;
    return new Gauge({ name, help, labelNames });
  }

  async onModuleInit() {
    // Premier refresh au demarrage pour que /metrics ait des donnees fraiches
    // immediatement (sans attendre le 1er tick @Interval).
    await this.refresh();
  }

  @Interval(REFRESH_INTERVAL_MS)
  async refresh() {
    try {
      const [contracts, tickets, users] = await Promise.all([
        this.prisma.contract.count({ where: { status: 'ACTIVE' } }),
        this.prisma.ticket.groupBy({
          by: ['priority'],
          where: { status: { not: 'CLOSED' } },
          _count: { _all: true },
        }),
        this.prisma.user.count({ where: { isActive: true } }),
      ]);
      this.contractsActive.set(contracts);
      this.usersActive.set(users);
      this.ticketsOpen.reset();
      for (const row of tickets as Array<{ priority: string; _count: { _all: number } }>) {
        this.ticketsOpen.set({ priority: row.priority }, row._count._all);
      }
      this.metricsLastRefreshAt.set(Math.floor(Date.now() / 1000));
    } catch (err: any) {
      this.metricsRefreshErrors.inc();
      // Log warn (pas error) car la BDD peut etre brievement indisponible ;
      // on garde les anciennes valeurs.
      this.logger.warn('Refresh metriques echoue : ' + err.message);
    }
  }
}
