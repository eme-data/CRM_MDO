import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EmailSecurityService } from './email-security.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Email Security')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('email-security')
export class EmailSecurityController {
  constructor(private readonly service: EmailSecurityService) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query('companyId') companyId?: string) {
    return this.service.listAll(user, { companyId });
  }

  @Get('stats')
  stats(@CurrentUser() user: JwtUser) {
    return this.service.stats(user);
  }

  @Get('by-domain/:domain')
  byDomain(@Param('domain') domain: string, @CurrentUser() user: JwtUser) {
    return this.service.findByDomain(domain, user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  // Re-check immediat (a la demande)
  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('check')
  check(@Body() body: { domain: string; companyId?: string }, @CurrentUser() user: JwtUser) {
    return this.service.checkDomain(body.domain, body.companyId, user.tenantId);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('companies/:companyId/check-all')
  checkAll(@Param('companyId') companyId: string, @CurrentUser() user: JwtUser) {
    return this.service.checkAllForCompany(companyId, user);
  }
}
