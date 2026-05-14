import { Controller, Get, Header, Res } from '@nestjs/common';
import { Response } from 'express';
import { register } from 'prom-client';
import { Public } from '../decorators/public.decorator';
import { AllowMfaPending } from '../decorators/allow-mfa-pending.decorator';

// Endpoint Prometheus standard. Les gauges metier sont rafraichies en tache de
// fond par MetricsService (toutes les 30s) ; ce controller ne fait que lire
// la registry → cout constant cote DB peu importe la frequence de scrape.
//
// Securite : la route est `Public` cote NestJS, mais Caddy filtre par IP en
// prod (handle /metrics + remote_ip) → seules les IPs internes peuvent y acceder.

@Controller('metrics')
export class MetricsController {
  @Public()
  @AllowMfaPending()
  @Get()
  @Header('Content-Type', register.contentType)
  async metrics(@Res() res: Response) {
    res.send(await register.metrics());
  }
}
