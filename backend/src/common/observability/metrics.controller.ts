import { Controller, Get, Header, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { register } from 'prom-client';
import { timingSafeEqual } from 'crypto';
import { Public } from '../decorators/public.decorator';
import { AllowMfaPending } from '../decorators/allow-mfa-pending.decorator';

// Endpoint Prometheus standard. Les gauges metier sont rafraichies en tache de
// fond par MetricsService (toutes les 30s) ; ce controller ne fait que lire
// la registry → cout constant cote DB peu importe la frequence de scrape.
//
// Securite (defense en profondeur) :
//   1. Caddy filtre par IP en prod (handle /metrics + remote_ip → 127.0.0.1
//      + reseaux Docker / RFC1918). Cf docker/caddy/Caddyfile.
//   2. Si METRICS_BEARER_TOKEN est defini en env, le backend exige aussi
//      `Authorization: Bearer <token>` (compare en temps constant pour eviter
//      les attaques timing). Cas d'usage : exposition a un scraper externe
//      (Grafana Cloud, Datadog) qui pousse depuis Internet via HTTPS.
//   3. Sans token et sans filtre IP Caddy : la route reste publique — c'est
//      acceptable en dev, NON acceptable en prod multi-instance.

@Controller('metrics')
export class MetricsController {
  @Public()
  @AllowMfaPending()
  @Get()
  @Header('Content-Type', register.contentType)
  async metrics(@Req() req: Request, @Res() res: Response) {
    const expectedToken = process.env.METRICS_BEARER_TOKEN?.trim();
    if (expectedToken) {
      const header = req.header('authorization') ?? '';
      const m = header.match(/^Bearer\s+(.+)$/i);
      const provided = m ? m[1].trim() : '';
      if (!this.constantTimeEqual(provided, expectedToken)) {
        throw new UnauthorizedException('Invalid metrics token');
      }
    }
    res.send(await register.metrics());
  }

  private constantTimeEqual(a: string, b: string): boolean {
    // timingSafeEqual exige des buffers de meme taille — on retourne false
    // si tailles differentes (apres avoir tout de meme fait un compare
    // factice pour ne pas leaker la taille via le delta de temps).
    const aBuf = Buffer.from(a, 'utf8');
    const bBuf = Buffer.from(b, 'utf8');
    if (aBuf.length !== bBuf.length) {
      // compare factice de meme taille que bBuf, resultat ignore
      timingSafeEqual(bBuf, bBuf);
      return false;
    }
    return timingSafeEqual(aBuf, bBuf);
  }
}
