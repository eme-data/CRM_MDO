import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DemoSeederService } from './demo-seeder.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../tenants/guards/super-admin.guard';

@ApiTags('Demo')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('demo')
export class DemoController {
  constructor(private readonly seeder: DemoSeederService) {}

  // Reinitialise les donnees du tenant de demonstration a la demande.
  @Post('reset')
  reset() {
    return this.seeder.reseed();
  }
}
