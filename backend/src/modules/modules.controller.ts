import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GROUPS, FEATURES, OFFERS } from './module-catalog';

// Expose le catalogue des modules/offres a l'UI super-admin (cases a cocher +
// boutons d'offres) et a tout front qui voudrait l'afficher. Lecture seule.
@ApiTags('Modules / offres')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('modules')
export class ModulesController {
  @Get('catalog')
  catalog() {
    return { groups: GROUPS, features: FEATURES, offers: OFFERS };
  }
}
