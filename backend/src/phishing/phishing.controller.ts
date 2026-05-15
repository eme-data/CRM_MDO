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

@ApiTags('Phishing simulations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('phishing')
export class PhishingController {
  constructor(private readonly service: PhishingService) {}

  @Get('campaigns')
  list(
    @Query('companyId') companyId?: string,
    @Query('status') status?: PhishingCampaignStatus,
  ) {
    return this.service.list({ companyId, status });
  }

  @Get('campaigns/:id')
  get(@Param('id') id: string) {
    return this.service.findOne(id);
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
  }) {
    return this.service.create(body);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Patch('campaigns/:id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete('campaigns/:id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('campaigns/:id/import')
  importResults(@Param('id') id: string, @Body() body: { rows: any[] }) {
    return this.service.importResults(id, body.rows ?? []);
  }

  @Get('companies/:companyId/risky-users')
  topRiskyUsers(@Param('companyId') companyId: string, @Query('limit') limit?: string) {
    return this.service.topRiskyUsers(companyId, limit ? parseInt(limit, 10) : 20);
  }
}
