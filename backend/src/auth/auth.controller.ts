import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Public } from '../common/decorators/public.decorator';
import { AllowMfaPending } from '../common/decorators/allow-mfa-pending.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('Auth')
// AuthController doit rester accessible quand mfaPending = true : l'utilisateur
// doit pouvoir consulter son profil, changer son mot de passe et se deconnecter.
@AllowMfaPending()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Anti brute-force : 10 tentatives / 5 min / IP (palier "auth" defini dans AppModule)
  @Throttle({ auth: { limit: 10, ttl: 300_000 } })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Throttle({ auth: { limit: 30, ttl: 300_000 } })
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.authService.refresh(dto.refreshToken, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  // ----- Sessions / device management -----
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('sessions')
  listSessions(@CurrentUser() user: JwtUser) {
    return this.authService.listSessions(user.id);
  }

  // Variante POST acceptant le refresh token courant pour le marquer "isCurrent".
  // (GET-with-body pose probleme avec certains clients/proxys.)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('sessions/list')
  @HttpCode(HttpStatus.OK)
  listSessionsWithCurrent(
    @CurrentUser() user: JwtUser,
    @Body() body: { currentRefreshToken?: string },
  ) {
    return this.authService.listSessions(user.id, body?.currentRefreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  revokeSession(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.authService.revokeSession(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('sessions/revoke-all')
  @HttpCode(HttpStatus.OK)
  revokeAll(
    @CurrentUser() user: JwtUser,
    @Body() body: { exceptCurrent?: boolean; currentRefreshToken?: string },
  ) {
    return this.authService.revokeAllSessions(
      user.id,
      body?.exceptCurrent ? body?.currentRefreshToken : undefined,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: JwtUser, @Body() body: { refreshToken?: string }) {
    await this.authService.logout(user.id, body?.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(@CurrentUser() user: JwtUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }
}
