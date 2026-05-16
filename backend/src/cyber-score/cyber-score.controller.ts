import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CyberScoreService } from './cyber-score.service';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('CyberScore')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class CyberScoreController {
  constructor(private readonly service: CyberScoreService) {}

  // Score d'une societe : utilise sur la fiche client. Cache 5 min en service.
  @Get('companies/:id/cyber-score')
  getForCompany(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.computeForCompany(id, user);
  }

  // Force le recalcul (apres action correctrice : MFA active, asset renouvele).
  @Post('companies/:id/cyber-score/refresh')
  refresh(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.refresh(id, user);
  }

  // Vue d'ensemble : score de tous les clients CUSTOMER. Pour page dashboard
  // posture cyber transverse.
  @Get('cyber-scores')
  getAll(@CurrentUser() user: JwtUser) {
    return this.service.computeAllCustomers(user);
  }
}
