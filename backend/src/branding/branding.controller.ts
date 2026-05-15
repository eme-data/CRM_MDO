import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { BrandingService } from './branding.service';

// Endpoint public : pas d'auth requise. Le frontend l'appelle au boot
// (avant le login) pour afficher le bon nom/logo sur la page de connexion
// et le portail client.

@ApiTags('Branding')
@Controller('branding')
export class BrandingController {
  constructor(private readonly service: BrandingService) {}

  @Public()
  @Get()
  get() {
    return this.service.get();
  }
}
