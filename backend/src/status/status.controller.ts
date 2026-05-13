import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { StatusService } from './status.service';

@ApiTags('Status')
@Controller('status')
export class StatusController {
  constructor(private readonly service: StatusService) {}

  // Endpoint public : pas d'auth. Rate-limit serre car la page peut etre
  // appelee depuis l'exterieur en boucle (auto-refresh navigateur).
  @Public()
  @Throttle({ short: { limit: 60, ttl: 60_000 } })
  @Get('public')
  publicOverview() {
    return this.service.publicOverview();
  }
}
