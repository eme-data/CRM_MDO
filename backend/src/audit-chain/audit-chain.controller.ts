import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditChainService } from './audit-chain.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SuperAdminGuard } from '../tenants/guards/super-admin.guard';

// La chaine d'audit est GLOBALE (hash-chain append-only de toutes les activites
// de l'instance, sequence continue, non scopable par tenant). C'est un outil
// d'integrite PLATEFORME -> stats/verify/seal sont reserves au super-admin.
// Cote UI, la page admin/activity catch le 403 sur /chain/stats (chainStats reste
// null) -> le bandeau "chaine d'audit" ne s'affiche simplement pas pour un admin
// tenant. Aucune donnee tenant n'est exposee ici.
@ApiTags('Audit chain')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, SuperAdminGuard)
@Controller('audit')
export class AuditChainController {
  constructor(private readonly service: AuditChainService) {}

  @Get('chain/stats')
  stats() {
    return this.service.stats();
  }

  // Verify (slow, parcourt toute la chaine globale).
  @Post('chain/verify')
  verify() {
    return this.service.verify();
  }

  // Scellement immediat de la chaine globale.
  @Post('chain/seal')
  seal() {
    return this.service.sealPending();
  }
}
