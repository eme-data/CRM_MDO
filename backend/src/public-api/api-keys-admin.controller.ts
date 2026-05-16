import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiKeyScope } from '@prisma/client';
import { ApiKeyService } from './api-key.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('API Keys (admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api-keys')
export class ApiKeysAdminController {
  constructor(private readonly service: ApiKeyService) {}

  @Roles('ADMIN', 'MANAGER')
  @Get()
  list(@CurrentUser() user: JwtUser, @Query('companyId') companyId?: string) {
    return this.service.list(user, { companyId });
  }

  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(
    @Body() body: { name: string; scope: ApiKeyScope; companyId?: string; expiresAt?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.create(body, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  revoke(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.revoke(id, user);
  }
}
