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
const DAY_MS = 24 * 3600 * 1000;

let defaultsCollected = false;

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);

  // === Gauges techniques ===
  readonly usersActive: Gauge<string>;
  readonly metricsRefreshErrors: Gauge<string>;
  readonly metricsLastRefreshAt: Gauge<string>;

  // === Gauges metier MSP ===
  // Contrats
  readonly contractsActive: Gauge<string>;
  readonly contractsMrrHt: Gauge<string>;        // somme monthlyAmountHt des contrats ACTIVE
  readonly contractsExpiring: Gauge<string>;     // label horizon : "30d" | "60d" | "90d"
  // Tickets
  readonly ticketsOpen: Gauge<string>;           // label priority
  readonly ticketsOverdue: Gauge<string>;        // status != closed/resolved/cancelled, dueDate < now
  // Operationnel
  readonly uptimeMonitorsDown: Gauge<string>;    // lastStatus = "DOWN"
  readonly timeEntriesUnbilledMinutes: Gauge<string>; // somme durationMin non facture

  constructor(private readonly prisma: PrismaService) {
    if (!defaultsCollected) {
      collectDefaultMetrics({ prefix: 'crm_' });
      defaultsCollected = true;
    }
    // Techniques
    this.usersActive = this.gauge('crm_users_active', 'Utilisateurs actifs (isActive)');
    this.metricsRefreshErrors = this.gauge(
      'crm_metrics_refresh_errors_total',
      'Nombre cumule d echecs de refresh metier des metriques',
    );
    this.metricsLastRefreshAt = this.gauge(
      'crm_metrics_last_refresh_timestamp_seconds',
      'Timestamp Unix du dernier refresh OK',
    );
    // Contrats
    this.contractsActive = this.gauge('crm_contracts_active', 'Contrats au statut ACTIVE');
    this.contractsMrrHt = this.gauge(
      'crm_contracts_mrr_ht_total',
      'MRR HT cumule (somme monthlyAmountHt) des contrats ACTIVE',
    );
    this.contractsExpiring = this.gauge(
      'crm_contracts_expiring',
      'Contrats ACTIVE expirant dans l horizon (label horizon : 30d | 60d | 90d)',
      ['horizon'],
    );
    // Tickets
    this.ticketsOpen = this.gauge(
      'crm_tickets_open',
      'Tickets ouverts (status != CLOSED), labelise par priority',
      ['priority'],
    );
    this.ticketsOverdue = this.gauge(
      'crm_tickets_overdue',
      'Tickets non-resolus avec dueDate depassee',
    );
    // Operationnel
    this.uptimeMonitorsDown = this.gauge(
      'crm_uptime_monitors_down',
      'Monitors uptime dont le dernier check est DOWN',
    );
    this.timeEntriesUnbilledMinutes = this.gauge(
      'crm_time_entries_unbilled_minutes',
      'Minutes facturables non encore facturees (billable=true, invoicedAt=null, endedAt!=null)',
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
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * DAY_MS);
      const in60 = new Date(now.getTime() + 60 * DAY_MS);
      const in90 = new Date(now.getTime() + 90 * DAY_MS);

      // Toutes les requetes en parallele. Les indexes composites poses par
      // le hardening precedent (status+endDate, status+dueDate) couvrent les
      // plans d'execution attendus.
      const [
        contractsActiveCount,
        contractsMrrAgg,
        contractsExpiring30,
        contractsExpiring60,
        contractsExpiring90,
        ticketsByPriority,
        ticketsOverdueCount,
        usersActiveCount,
        uptimeDownCount,
        timeUnbilledAgg,
      ] = await Promise.all([
        this.prisma.contract.count({ where: { status: 'ACTIVE' } }),
        this.prisma.contract.aggregate({
          where: { status: 'ACTIVE' },
          _sum: { monthlyAmountHt: true },
        }),
        // Horizon 30 j : endDate ∈ [now, now+30j]
        this.prisma.contract.count({
          where: { status: 'ACTIVE', endDate: { gte: now, lte: in30 } },
        }),
        // Horizon 60 j (cumulatif : inclut les 30 j) → on prend lte: in60 pour
        // une vue "tout ce qui expire d ici 60 j". Permet a Prometheus / Grafana
        // de calculer le 30-60 par soustraction si necessaire.
        this.prisma.contract.count({
          where: { status: 'ACTIVE', endDate: { gte: now, lte: in60 } },
        }),
        this.prisma.contract.count({
          where: { status: 'ACTIVE', endDate: { gte: now, lte: in90 } },
        }),
        this.prisma.ticket.groupBy({
          by: ['priority'],
          where: { status: { not: 'CLOSED' } },
          _count: { _all: true },
        }),
        this.prisma.ticket.count({
          where: {
            status: { notIn: ['RESOLVED', 'CLOSED', 'CANCELLED'] },
            dueDate: { lt: now },
          },
        }),
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.uptimeMonitor.count({
          where: { enabled: true, lastStatus: 'DOWN' },
        }),
        this.prisma.timeEntry.aggregate({
          where: { billable: true, invoicedAt: null, endedAt: { not: null } },
          _sum: { durationMin: true },
        }),
      ]);

      // Contrats
      this.contractsActive.set(contractsActiveCount);
      // monthlyAmountHt est Decimal : on retourne 0 si aucune ligne, sinon Number().
      const mrrRaw = contractsMrrAgg._sum.monthlyAmountHt;
      this.contractsMrrHt.set(mrrRaw === null || mrrRaw === undefined ? 0 : Number(mrrRaw));
      this.contractsExpiring.set({ horizon: '30d' }, contractsExpiring30);
      this.contractsExpiring.set({ horizon: '60d' }, contractsExpiring60);
      this.contractsExpiring.set({ horizon: '90d' }, contractsExpiring90);

      // Tickets
      this.ticketsOpen.reset();
      for (const row of ticketsByPriority as Array<{
        priority: string;
        _count: { _all: number };
      }>) {
        this.ticketsOpen.set({ priority: row.priority }, row._count._all);
      }
      this.ticketsOverdue.set(ticketsOverdueCount);

      // Users / operationnel
      this.usersActive.set(usersActiveCount);
      this.uptimeMonitorsDown.set(uptimeDownCount);
      this.timeEntriesUnbilledMinutes.set(timeUnbilledAgg._sum.durationMin ?? 0);

      this.metricsLastRefreshAt.set(Math.floor(Date.now() / 1000));
    } catch (err: any) {
      this.metricsRefreshErrors.inc();
      // Log warn (pas error) car la BDD peut etre brievement indisponible ;
      // on garde les anciennes valeurs.
      this.logger.warn('Refresh metriques echoue : ' + err.message);
    }
  }
}
