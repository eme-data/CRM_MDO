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
// Cookie one-shot pour transmettre les tokens entre callback (cote serveur)
// et la page /sso-callback du frontend (qui appelle /exchange).
const SSO_EXCHANGE_COOKIE = 'mdo_sso_exchange';

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

  // Endpoint public consomme par la page /login pour decider d'afficher le
  // bouton "Sign in with SSO". Resout le tenant depuis le Host (middleware
  // global) et renvoie { enabled, tenantSlug }. Pas de leak : on ne devoile
  // ni l'issuer, ni le clientId — juste si le bouton doit apparaitre.
  @AllowMfaPending()
  @Get('status')
  async status(@Req() req: Request) {
    const tenant = req.tenant;
    if (!tenant) return { enabled: false, tenantSlug: null };
    const enabled = await this.sso.isEnabledFor(tenant.id);
    return { enabled, tenantSlug: enabled ? tenant.slug : null };
  }

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

    // Bridge cookie -> localStorage : le reste de l'app utilise des Bearer
    // tokens en localStorage (cf api.ts). On stocke les tokens dans un cookie
    // HTTP-only court (60s) signe en JWT, on redirige vers une page frontend
    // /sso-callback qui appelle /auth/sso/exchange pour les recuperer, les
    // place dans localStorage puis redirige vers la destination finale.
    // Avantages : tokens jamais dans l'URL/history, atomicite (one-shot via
    // clearCookie cote exchange).
    const exchangeToken = await this.jwt.signAsync(
      { at: tokens.accessToken, rt: tokens.refreshToken, ret: payload.return || '/' },
      { expiresIn: '60s' },
    );
    res.cookie(SSO_EXCHANGE_COOKIE, exchangeToken, {
      httpOnly: true,
      secure: this.isProd(),
      sameSite: 'lax',
      maxAge: 60_000,
      path: '/api/auth/sso',
    });
    res.redirect(302, '/sso-callback');
  }

  // Exchange : la page /sso-callback du frontend appelle cet endpoint pour
  // recuperer les tokens depuis le cookie one-shot, et les stocker dans
  // localStorage. Le cookie est immediatement efface (anti-rejeu).
  @AllowMfaPending()
  @Get('exchange')
  async exchange(@Req() req: Request, @Res() res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.[SSO_EXCHANGE_COOKIE];
    if (!token) throw new UnauthorizedException('Aucune session SSO en attente');
    let payload: { at: string; rt: string; ret: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Cookie exchange invalide ou expire');
    }
    res.clearCookie(SSO_EXCHANGE_COOKIE, { path: '/api/auth/sso' });
    res.json({
      accessToken: payload.at,
      refreshToken: payload.rt,
      returnPath: payload.ret,
    });
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
