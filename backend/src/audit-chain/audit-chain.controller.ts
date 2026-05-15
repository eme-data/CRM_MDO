import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditChainService } from './audit-chain.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

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

  // Verify (slow) — reservee ADMIN car parcourt toute la chaine
  @Roles('ADMIN')
  @Post('chain/verify')
  verify() {
    return this.service.verify();
  }

  // Force le scellement immediat (utile pour debugger / tester apres edition manuelle)
  @Roles('ADMIN')
  @Post('chain/seal')
  seal() {
    return this.service.sealPending();
  }
}
