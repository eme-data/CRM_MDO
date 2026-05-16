import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AllowMfaPending } from '../../common/decorators/allow-mfa-pending.decorator';
import { TenantsService } from '../../tenants/tenants.service';
import { AuthService } from '../auth.service';
import { SsoService, OidcSession } from './sso.service';

// Cookie name pour le state intermediaire OIDC (state + nonce + code_verifier).
// HTTP-only, signed (JWT court), expire en 10 min.
const SSO_COOKIE = 'mdo_sso_session';
const SSO_COOKIE_TTL_SECONDS = 600;

@ApiTags('Auth — SSO (OIDC)')
@Public()
@UseGuards(ThrottlerGuard)
@Controller('auth/sso')
export class SsoController {
  private readonly logger = new Logger(SsoController.name);

  constructor(
    private readonly sso: SsoService,
    private readonly tenants: TenantsService,
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // Lance le flow SSO : redirige le navigateur vers l'IdP du tenant.
  // /auth/sso/<tenantSlug>/start?return=/dashboard
  @AllowMfaPending()
  @Get(':tenantSlug/start')
  async start(
    @Param('tenantSlug') tenantSlug: string,
    @Query('return') returnPath: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const tenant = await this.tenants.findBySlugStrict(tenantSlug);
    if (!(await this.sso.isEnabledFor(tenant.id))) {
      throw new BadRequestException('SSO non active pour ce tenant');
    }
    const redirectUri = this.callbackUrl(req);
    const { url, session } = await this.sso.beginLogin(tenant, redirectUri);

    // On stocke session + returnPath dans un JWT short-lived cookie. Pas de DB.
    const sessionToken = await this.jwt.signAsync(
      { sso: session, return: this.safeReturnPath(returnPath) },
      { expiresIn: SSO_COOKIE_TTL_SECONDS + 's' },
    );
    res.cookie(SSO_COOKIE, sessionToken, {
      httpOnly: true,
      secure: this.isProd(),
      sameSite: 'lax', // lax requis car redirect cross-site depuis l'IdP
      maxAge: SSO_COOKIE_TTL_SECONDS * 1000,
      path: '/api/auth/sso',
    });

    res.redirect(302, url);
  }

  // Callback OIDC : l'IdP redirige ici avec ?code=&state=
  // /auth/sso/callback?code=...&state=...
  @AllowMfaPending()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (error) {
      this.logger.warn(`SSO callback error : ${error} - ${errorDescription ?? ''}`);
      return res.redirect(302, '/login?sso_error=' + encodeURIComponent(error));
    }
    if (!code || !state) {
      throw new BadRequestException('code et state requis');
    }

    // Lis et valide le cookie de session
    const sessionToken = (req.cookies as Record<string, string> | undefined)?.[SSO_COOKIE];
    if (!sessionToken) {
      throw new UnauthorizedException('Session SSO expiree ou cookie manquant');
    }
    let payload: { sso: OidcSession; return: string };
    try {
      payload = await this.jwt.verifyAsync(sessionToken);
    } catch {
      throw new UnauthorizedException('Cookie session SSO invalide');
    }
    // Cookie used : on l'efface tout de suite pour empecher le rejeu
    res.clearCookie(SSO_COOKIE, { path: '/api/auth/sso' });

    const tenant = await this.tenants.findOne(payload.sso.tenantId);
    const redirectUri = this.callbackUrl(req);
    const user = await this.sso.completeLogin(tenant, redirectUri, code, state, payload.sso);

    // Issue notre JWT applicatif via AuthService (meme path qu'un login local
    // mais sans verif password). On expose une methode dediee dans AuthService.
    const tokens = await this.auth.issueTokensForUser(user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Renvoie tokens via cookie + redirect pour que le frontend les capte.
    // Strategie classique : stocker l'accessToken en HTTP-only cookie pour les
    // requetes API (le frontend lit le user via /auth/me). Refresh token en
    // cookie HTTP-only egalement, valide sur /auth/refresh uniquement.
    res.cookie('mdo_access', tokens.accessToken, {
      httpOnly: true,
      secure: this.isProd(),
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 min (sync avec JWT expiration)
      path: '/',
    });
    res.cookie('mdo_refresh', tokens.refreshToken, {
      httpOnly: true,
      secure: this.isProd(),
      sameSite: 'lax',
      maxAge: 30 * 86400 * 1000, // 30 jours
      path: '/api/auth/refresh',
    });

    const dest = payload.return || '/';
    res.redirect(302, dest);
  }

  // Helpers

  private callbackUrl(req: Request): string {
    const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host;
    const proto = (req.headers['x-forwarded-proto'] as string) ?? (this.isProd() ? 'https' : 'http');
    return `${proto}://${host}/api/auth/sso/callback`;
  }

  // Limite les redirections post-login aux chemins relatifs internes
  // (empeche open redirect : ?return=https://evil.com).
  private safeReturnPath(p: string | undefined): string {
    if (!p) return '/';
    if (!p.startsWith('/') || p.startsWith('//')) return '/';
    return p;
  }

  private isProd(): boolean {
    return (this.config.get<string>('NODE_ENV') ?? 'development') === 'production';
  }
}
