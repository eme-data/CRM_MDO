import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { IcalService } from './ical.service';
import { Public } from '../common/decorators/public.decorator';

// Endpoint public d'export iCalendar. L'authentification se fait via le token
// opaque dans l'URL (les clients calendrier n'envoient pas de Bearer JWT).
//
// Le token est revocable via /interventions/me/ical (cote authentifie).
@ApiTags('Calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly ical: IcalService) {}

  // Limite a 60 hits / 5 min / IP : un client calendrier sync au plus toutes
  // les 5-15 minutes, on est tres loin du palier.
  @Throttle({ short: { limit: 60, ttl: 300_000 } })
  @Public()
  @Get(':token/interventions.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async ics(@Param('token') token: string, @Res() res: Response) {
    const ics = await this.ical.buildIcsForToken(token);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(ics);
  }
}
