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

@ApiTags('Email Security')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('email-security')
export class EmailSecurityController {
  constructor(private readonly service: EmailSecurityService) {}

  @Get()
  list(@Query('companyId') companyId?: string) {
    return this.service.listAll({ companyId });
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Get('by-domain/:domain')
  byDomain(@Param('domain') domain: string) {
    return this.service.findByDomain(domain);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // Re-check immediat (a la demande)
  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('check')
  check(@Body() body: { domain: string; companyId?: string }) {
    return this.service.checkDomain(body.domain, body.companyId);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('companies/:companyId/check-all')
  checkAll(@Param('companyId') companyId: string) {
    return this.service.checkAllForCompany(companyId);
  }
}
