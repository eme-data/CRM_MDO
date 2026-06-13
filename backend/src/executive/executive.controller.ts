import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ExecutiveService } from './executive.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Executive')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('executive')
export class ExecutiveController {
  constructor(private readonly service: ExecutiveService) {}

  @Roles('ADMIN', 'MANAGER')
  @Get('snapshot')
  snapshot(@CurrentUser() user: JwtUser) {
    return this.service.snapshot(user.tenantId);
  }
}
