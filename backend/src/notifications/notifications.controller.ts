import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listForUser(user.id, {
      unreadOnly: unreadOnly === 'true',
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: JwtUser) {
    return { count: await this.service.unreadCount(user.id) };
  }

  @Post(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.markRead(id, user.id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: JwtUser) {
    return this.service.markAllRead(user.id);
  }
}
