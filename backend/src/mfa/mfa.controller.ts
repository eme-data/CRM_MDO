import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MfaService } from './mfa.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('MFA')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mfa')
export class MfaController {
  constructor(private readonly service: MfaService) {}

  @Get('status')
  status(@CurrentUser() user: JwtUser) { return this.service.status(user.id); }

  @Post('setup')
  setup(@CurrentUser() user: JwtUser) {
    return this.service.setup(user.id, user.email);
  }

  @Post('enable')
  enable(@CurrentUser() user: JwtUser, @Body() body: { code: string }) {
    return this.service.enable(user.id, body.code);
  }

  @Post('disable')
  disable(@CurrentUser() user: JwtUser, @Body() body: { code: string }) {
    return this.service.disable(user.id, body.code);
  }
}
