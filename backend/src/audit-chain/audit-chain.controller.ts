import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditChainService } from './audit-chain.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SuperAdminGuard } from '../tenants/guards/super-admin.guard';

// La chaine d'audit est GLOBALE (hash-chain append-only de toutes les activites
// de l'instance, sequence continue, non scopable par tenant). stats reste lisible
// par un ADMIN (2 compteurs, fuite negligeable) pour ne pas casser la page
// admin/activity ; en revanche verify (parcourt toute la chaine, lourd) et seal
// (action de scellement plateforme) sont des operations PLATEFORME -> super-admin.
@ApiTags('Audit chain')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit')
export class AuditChainController {
  constructor(private readonly service: AuditChainService) {}

  @Roles('ADMIN', 'MANAGER')
  @Get('chain/stats')
  stats() {
    return this.service.stats();
  }

  // Verify (slow, parcourt toute la chaine globale) — super-admin uniquement.
  @UseGuards(SuperAdminGuard)
  @Post('chain/verify')
  verify() {
    return this.service.verify();
  }

  // Scellement immediat de la chaine globale — super-admin uniquement.
  @UseGuards(SuperAdminGuard)
  @Post('chain/seal')
  seal() {
    return this.service.sealPending();
  }
}
