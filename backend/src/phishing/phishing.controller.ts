import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PhishingCampaignStatus, PhishingVendor } from '@prisma/client';
import { PhishingService } from './phishing.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Phishing simulations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('phishing')
export class PhishingController {
  constructor(private readonly service: PhishingService) {}

  @Get('campaigns')
  list(
    @CurrentUser() user: JwtUser,
    @Query('companyId') companyId?: string,
    @Query('status') status?: PhishingCampaignStatus,
  ) {
    return this.service.list(user, { companyId, status });
  }

  @Get('campaigns/:id')
  get(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('campaigns')
  create(@Body() body: {
    name: string;
    vendor?: PhishingVendor;
    companyId: string;
    sentAt?: string;
    templateName?: string;
    notes?: string;
    externalId?: string;
  }, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Patch('campaigns/:id')
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete('campaigns/:id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('campaigns/:id/import')
  importResults(@Param('id') id: string, @Body() body: { rows: any[] }, @CurrentUser() user: JwtUser) {
    return this.service.importResults(id, body.rows ?? [], user);
  }

  @Get('companies/:companyId/risky-users')
  topRiskyUsers(
    @Param('companyId') companyId: string,
    @CurrentUser() user: JwtUser,
    @Query('limit') limit?: string,
  ) {
    return this.service.topRiskyUsers(companyId, user, limit ? parseInt(limit, 10) : 20);
  }
}
