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
import { ContractOffer, OnboardingStepStatus, Role } from '@prisma/client';
import { OnboardingService } from './onboarding.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Onboarding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}

  // ---------- Templates ----------
  @Get('templates')
  listTemplates(@Query('includeInactive') includeInactive?: string) {
    return this.service.listTemplates(includeInactive === 'true');
  }

  @Get('templates/:id')
  getTemplate(@Param('id') id: string) {
    return this.service.findTemplate(id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('templates')
  createTemplate(@Body() body: {
    name: string;
    description?: string;
    offer?: ContractOffer | null;
    steps: Array<{ title: string; description?: string; dueDateOffsetDays?: number; assigneeRole?: Role }>;
  }) {
    return this.service.createTemplate(body);
  }

  @Roles('ADMIN', 'MANAGER')
  @Patch('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() body: any) {
    return this.service.updateTemplate(id, body);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete('templates/:id')
  removeTemplate(@Param('id') id: string) {
    return this.service.removeTemplate(id);
  }

  // ---------- Runs ----------
  @Get('runs')
  listRuns(
    @Query('companyId') companyId?: string,
    @Query('status') status?: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
  ) {
    return this.service.listRuns({ companyId, status });
  }

  @Get('runs/:id')
  getRun(@Param('id') id: string) {
    return this.service.findRun(id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post('contracts/:contractId/start')
  startForContract(
    @Param('contractId') contractId: string,
    @Body() body: { templateId?: string },
  ) {
    return this.service.startForContract(contractId, body.templateId);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('runs/:id/cancel')
  cancelRun(@Param('id') id: string) {
    return this.service.cancelRun(id);
  }

  @Patch('steps/:id')
  updateStep(
    @Param('id') id: string,
    @Body() body: {
      status?: OnboardingStepStatus;
      assigneeId?: string | null;
      notes?: string | null;
      dueDate?: string | null;
    },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateStep(id, body, user.id);
  }
}
