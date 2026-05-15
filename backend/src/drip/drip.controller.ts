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
import { DripEnrollmentStatus } from '@prisma/client';
import { DripService } from './drip.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Drip campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('drip')
export class DripController {
  constructor(private readonly service: DripService) {}

  // ---------- Campagnes ----------
  @Get('campaigns')
  list(@Query('includeInactive') includeInactive?: string) {
    return this.service.list(includeInactive === 'true');
  }

  @Get('campaigns/:id')
  get(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('campaigns')
  create(@Body() body: any) {
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

  // ---------- Enrollments ----------
  @Get('enrollments')
  enrollments(
    @Query('campaignId') campaignId?: string,
    @Query('status') status?: DripEnrollmentStatus,
  ) {
    return this.service.listEnrollments({ campaignId, status });
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('enrollments')
  enroll(@Body() body: {
    campaignId: string;
    recipientEmail: string;
    recipientName?: string;
    contactId?: string;
    companyId?: string;
  }) {
    return this.service.enroll(body);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('enrollments/:id/unsubscribe')
  unsub(@Param('id') id: string) {
    return this.service.unsubscribe(id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('enrollments/:id/pause')
  pause(@Param('id') id: string) {
    return this.service.pauseResume(id, 'PAUSED');
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('enrollments/:id/resume')
  resume(@Param('id') id: string) {
    return this.service.pauseResume(id, 'RUNNING');
  }
}
