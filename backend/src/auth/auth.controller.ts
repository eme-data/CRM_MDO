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
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
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
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from './auth-cookie.helper';
import { OptionalTenant } from '../tenants/decorators/current-tenant.decorator';
import { ALL_FEATURE_CODES, resolveFeatures } from '../modules/module-catalog';
import type { Tenant } from '@prisma/client';

@ApiTags('Auth')
// AuthController doit rester accessible quand mfaPending = true : l'utilisateur
// doit pouvoir consulter son profil, changer son mot de passe et se deconnecter.
@AllowMfaPending()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private cookieConfig() {
    return {
      accessExpiresIn: this.config.get<string>('jwt.expiresIn'),
      refreshExpiresIn: this.config.get<string>('jwt.refreshExpiresIn'),
      isProd: process.env.NODE_ENV === 'production',
    };
  }

  // Anti brute-force : 10 tentatives / 5 min / IP (palier "auth" defini dans AppModule)
  @Throttle({ auth: { limit: 10, ttl: 300_000 } })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      tenant: req.tenant,
    });
    // Migration cookies httpOnly : on set en plus, sans casser les clients
    // qui lisent encore accessToken/refreshToken depuis le body.
    setAuthCookies(res, tokens, this.cookieConfig());
    return tokens;
  }

  @Throttle({ auth: { limit: 30, ttl: 300_000 } })
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Dual-stack : on accepte le refresh token soit via cookie httpOnly
    // (preferable, immune au XSS), soit via body (compat localStorage).
    const cookieRefresh = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const refreshToken = cookieRefresh || dto.refreshToken;
    if (!refreshToken) {
      // BadRequest plutot que 401 : le client a oublie d'envoyer le token.
      return { error: 'refreshToken manquant (ni cookie ni body)' };
    }
    const tokens = await this.authService.refresh(refreshToken, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    setAuthCookies(res, tokens, this.cookieConfig());
    return tokens;
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
  async logout(
    @CurrentUser() user: JwtUser,
    @Body() body: { refreshToken?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieRefresh = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await this.authService.logout(user.id, body?.refreshToken ?? cookieRefresh);
    clearAuthCookies(res);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: JwtUser, @OptionalTenant() tenant?: Tenant) {
    // `modules` = features effectives pour le front (gating sidebar/pages).
    // Super-admin ou tenant sans restriction => tout le catalogue.
    const modules = user.isSuperAdmin
      ? [...ALL_FEATURE_CODES]
      : resolveFeatures(tenant?.enabledModules);
    return { ...user, modules };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(@CurrentUser() user: JwtUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }
}
