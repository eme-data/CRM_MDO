import { Controller, Get, Header, Res } from '@nestjs/common';
import { Response } from 'express';
import { register, collectDefaultMetrics, Gauge } from 'prom-client';
import { Public } from '../decorators/public.decorator';
import { AllowMfaPending } from '../decorators/allow-mfa-pending.decorator';
import { PrismaService } from '../../database/prisma.service';

// Endpoint Prometheus standard. Expose les metriques Node.js par defaut
// (event loop lag, GC, memoire, file descriptors) + quelques compteurs metier
// utiles a un MSP (contrats actifs, tickets ouverts, jobs BullMQ failed).
//
// Securite : la route est `Public` cote NestJS, mais Caddy filtre par IP en
// prod (handle /metrics + remote_ip) → seules les IPs internes peuvent y acceder.

let defaultsCollected = false;

@Controller('metrics')
export class MetricsController {
  private readonly contractsActiveGauge: Gauge<string>;
  private readonly ticketsOpenGauge: Gauge<string>;
  private readonly usersActiveGauge: Gauge<string>;

  constructor(private readonly prisma: PrismaService) {
    if (!defaultsCollected) {
      collectDefaultMetrics({ prefix: 'crm_' });
      defaultsCollected = true;
    }
    // Initialise (ou reutilise) les gauges metier. `register.getSingleMetric`
    // permet le hot-reload en dev sans dupliquer les enregistrements.
    this.contractsActiveGauge =
      (register.getSingleMetric('crm_contracts_active') as Gauge<string>) ??
      new Gauge({
        name: 'crm_contracts_active',
        help: 'Nombre de contrats au statut ACTIVE',
      });
    this.ticketsOpenGauge =
      (register.getSingleMetric('crm_tickets_open') as Gauge<string>) ??
      new Gauge({
        name: 'crm_tickets_open',
        help: 'Tickets ouverts (status != CLOSED)',
        labelNames: ['priority'],
      });
    this.usersActiveGauge =
      (register.getSingleMetric('crm_users_active') as Gauge<string>) ??
      new Gauge({
        name: 'crm_users_active',
        help: 'Utilisateurs actifs (isActive = true)',
      });
  }

  @Public()
  @AllowMfaPending()
  @Get()
  @Header('Content-Type', register.contentType)
  async metrics(@Res() res: Response) {
    // Refresh des gauges metier a chaque scrape. Pour des bases plus grosses,
    // remplacer par un cron qui met a jour les gauges et eviter les requetes
    // synchrones a chaque /metrics. Pour notre volumetrie c'est OK.
    try {
      const [contracts, tickets, users] = await Promise.all([
        this.prisma.contract.count({ where: { status: 'ACTIVE' } }),
        this.prisma.ticket.groupBy({
          by: ['priority'],
          where: { status: { not: 'CLOSED' } },
          _count: { _all: true },
        }) as any,
        this.prisma.user.count({ where: { isActive: true } }),
      ]);
      this.contractsActiveGauge.set(contracts);
      this.usersActiveGauge.set(users);
      this.ticketsOpenGauge.reset();
      for (const row of tickets as Array<{ priority: string; _count: { _all: number } }>) {
        this.ticketsOpenGauge.set({ priority: row.priority }, row._count._all);
      }
    } catch {
      // si la BDD est down, on retourne quand meme les metriques systeme
    }
    res.send(await register.metrics());
  }
}
