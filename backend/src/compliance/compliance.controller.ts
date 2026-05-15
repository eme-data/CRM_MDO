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
import { ComplianceControlStatus } from '@prisma/client';
import { ComplianceService } from './compliance.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('compliance')
export class ComplianceController {
  constructor(private readonly service: ComplianceService) {}

  // ---------- Frameworks (templates) ----------
  @Get('frameworks')
  listFrameworks(@Query('includeInactive') includeInactive?: string) {
    return this.service.listFrameworks(includeInactive === 'true');
  }

  @Get('frameworks/:id')
  getFramework(@Param('id') id: string) {
    return this.service.getFramework(id);
  }

  // ---------- Stats ----------
  @Get('stats')
  stats() {
    return this.service.stats();
  }

  // ---------- Assessments ----------
  @Get('companies/:companyId/assessments')
  listForCompany(@Param('companyId') companyId: string) {
    return this.service.listAssessmentsForCompany(companyId);
  }

  @Get('assessments/:id')
  getAssessment(@Param('id') id: string) {
    return this.service.getAssessment(id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('companies/:companyId/assessments')
  start(
    @Param('companyId') companyId: string,
    @Body() body: { frameworkId: string; ownerId?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.startAssessment(companyId, body.frameworkId, body.ownerId, user.id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete('assessments/:id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.deleteAssessment(id, user.id);
  }

  @Patch('control-assessments/:id')
  updateControl(
    @Param('id') id: string,
    @Body() body: {
      status?: ComplianceControlStatus;
      evidence?: string | null;
      evidenceUrl?: string | null;
      notes?: string | null;
      dueDate?: string | null;
    },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateControlAssessment(id, body, user.id);
  }
}
