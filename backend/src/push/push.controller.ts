import { Body, Controller, Delete, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PushService } from './push.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Push')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('push')
export class PushController {
  constructor(private readonly service: PushService) {}

  // Cle publique a recuperer cote frontend pour souscrire
  @Get('public-key')
  async publicKey() {
    const k = await this.service.getPublicKey();
    return { publicKey: k };
  }

  @Get('subscriptions')
  list(@CurrentUser() user: JwtUser) {
    return this.service.listForUser(user.id);
  }

  @Post('subscribe')
  subscribe(
    @Body() body: { endpoint: string; keys: { p256dh: string; auth: string } },
    @Headers('user-agent') ua: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.subscribe(user.id, body, ua);
  }

  @Delete('subscribe')
  unsubscribe(@Body() body: { endpoint: string }, @CurrentUser() user: JwtUser) {
    return this.service.unsubscribe(body.endpoint, user.id);
  }

  @Post('test')
  test(@CurrentUser() user: JwtUser) {
    return this.service.sendTest(user.id);
  }

  // Generation initiale des cles VAPID (ADMIN seul, action one-shot)
  @Roles('ADMIN')
  @Post('admin/generate-vapid')
  generate() {
    return this.service.generateAndStoreVapid();
  }
}
