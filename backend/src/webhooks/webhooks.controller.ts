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
import { WebhookEvent } from '@prisma/client';
import { WebhooksService } from './webhooks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Webhooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  @Roles('ADMIN', 'MANAGER')
  @Get()
  list(@Query('companyId') companyId?: string) {
    return this.service.list({ companyId });
  }

  @Roles('ADMIN', 'MANAGER')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() body: {
    url: string;
    description?: string;
    events: WebhookEvent[];
    companyId?: string;
  }, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user.id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post(':id/regenerate-secret')
  regenerateSecret(@Param('id') id: string) {
    return this.service.regenerateSecret(id);
  }
}
