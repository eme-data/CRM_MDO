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
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Drip campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('drip')
export class DripController {
  constructor(private readonly service: DripService) {}

  // ---------- Campagnes ----------
  @Get('campaigns')
  list(@CurrentUser() user: JwtUser, @Query('includeInactive') includeInactive?: string) {
    return this.service.list(user, includeInactive === 'true');
  }

  @Get('campaigns/:id')
  get(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('campaigns')
  create(@Body() body: any, @CurrentUser() user: JwtUser) {
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

  // ---------- Enrollments ----------
  @Get('enrollments')
  enrollments(
    @CurrentUser() user: JwtUser,
    @Query('campaignId') campaignId?: string,
    @Query('status') status?: DripEnrollmentStatus,
  ) {
    return this.service.listEnrollments(user, { campaignId, status });
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('enrollments')
  enroll(@Body() body: {
    campaignId: string;
    recipientEmail: string;
    recipientName?: string;
    contactId?: string;
    companyId?: string;
  }, @CurrentUser() user: JwtUser) {
    return this.service.enroll(body, user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('enrollments/:id/unsubscribe')
  unsub(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.unsubscribe(id, user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('enrollments/:id/pause')
  pause(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.pauseResume(id, 'PAUSED', user);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('enrollments/:id/resume')
  resume(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.pauseResume(id, 'RUNNING', user);
  }
}
