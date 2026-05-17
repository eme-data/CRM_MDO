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
import { WebhooksService } from './webhooks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';

@ApiTags('Webhooks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  @Roles('ADMIN', 'MANAGER')
  @Get()
  list(@CurrentUser() user: JwtUser, @Query('companyId') companyId?: string) {
    return this.service.list(user, { companyId });
  }

  @Roles('ADMIN', 'MANAGER')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() body: CreateWebhookDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateWebhookDto, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post(':id/regenerate-secret')
  regenerateSecret(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.regenerateSecret(id, user);
  }
}
