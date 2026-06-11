import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { Issuer, Client, generators } from 'openid-client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { encryptSecret } from '../../common/crypto/secret-cipher';

// SsoService — flux OIDC standard avec PKCE.
//
// Architecture multi-tenant :
//   - Chaque tenant configure son IdP via Settings (sso.oidc.*).
//   - L'IdP peut etre Entra ID, Keycloak, Google, Auth0, etc. — openid-client
//     gere la decouverte via /.well-known/openid-configuration.
//   - Les credentials (clientSecret) sont SECRETS = pas de fallback global
//     pour les tenants (cf SettingsService).
//
// Flow :
//   1. /auth/sso/<tenantSlug>/start   -> redirect IdP (state + PKCE en cookie)
//   2. IdP -> redirect /auth/sso/callback?code=&state=
//   3. /auth/sso/callback             -> exchange code, verify ID token,
//                                        JIT provision si autorise, issue JWT
//
// Sessions transitoires : on stocke state + nonce + code_verifier + tenantId
// dans un cookie HTTP-only signe. Pas de DB roundtrip pendant l'auth.

export interface OidcSession {
  tenantId: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);
  // Cache des Client OIDC par tenant : la decouverte (HTTP call) est cher.
  // TTL implicite : on garde le client tant que le settings ne change pas.
  // Invalidation manuelle via invalidateClient(tenantId) si admin modifie
  // les credentials.
  private readonly clientCache = new Map<string, Client>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  invalidateClient(tenantId: string) {
    this.clientCache.delete(tenantId);
  }

  async isEnabledFor(tenantId: string): Promise<boolean> {
    return this.settings.getBool('sso.enabled', tenantId);
  }

  // Construit (et cache) un Client OIDC pour ce tenant. Throw si SSO non
  // configure ou credentials manquants.
  private async buildClient(tenantId: string, redirectUri: string): Promise<Client> {
    const cached = this.clientCache.get(tenantId);
    if (cached) return cached;

    const issuerUrl = await this.settings.get('sso.oidc.issuerUrl', tenantId);
    const clientId = await this.settings.get('sso.oidc.clientId', tenantId);
    const clientSecret = await this.settings.get('sso.oidc.clientSecret', tenantId);
    if (!issuerUrl || !clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'SSO non configure : settings sso.oidc.issuerUrl / clientId / clientSecret requis pour ce tenant',
      );
    }

    let issuer: Issuer;
    try {
      issuer = await Issuer.discover(issuerUrl);
    } catch (err: any) {
      throw new ServiceUnavailableException(
        'OIDC discovery echec sur ' + issuerUrl + ' : ' + err.message,
      );
    }

    const client = new issuer.Client({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: [redirectUri],
      response_types: ['code'],
      // Beaucoup d'IdPs supportent client_secret_post ; on laisse openid-client
      // detecter via la metadata issuer (token_endpoint_auth_methods_supported).
    });
    this.clientCache.set(tenantId, client);
    return client;
  }

  // Initie le flow : genere state + nonce + PKCE, renvoie l'URL d'autorisation
  // ET la session a stocker en cookie.
  async beginLogin(tenant: Tenant, redirectUri: string): Promise<{ url: string; session: OidcSession }> {
    const client = await this.buildClient(tenant.id, redirectUri);
    const state = generators.state();
    const nonce = generators.nonce();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    let scopes = (await this.settings.get('sso.oidc.scopes', tenant.id)) ?? 'openid email profile';

    // Envoi delegue : si active ET IdP Entra, on demande en plus le scope Graph
    // Mail.Send + offline_access pour capturer un refresh token delegue (envoi
    // des replies tickets « au nom » de l'agent). Gate stricte : on ne touche
    // pas aux scopes pour les IdP non-Entra (Keycloak/Google casseraient).
    const issuerUrl = await this.settings.get('sso.oidc.issuerUrl', tenant.id);
    if (
      (await this.settings.getBool('mail.delegatedEnabled', tenant.id)) &&
      issuerUrl?.includes('login.microsoftonline.com')
    ) {
      if (!/\boffline_access\b/.test(scopes)) scopes += ' offline_access';
      if (!/Mail\.Send/.test(scopes)) scopes += ' https://graph.microsoft.com/Mail.Send';
    }

    const url = client.authorizationUrl({
      scope: scopes,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return { url, session: { tenantId: tenant.id, state, nonce, codeVerifier } };
  }

  // Termine le flow : echange le code, valide l'ID token, JIT provision ou
  // matche l'user existant. Renvoie le user CRM (pour issueTokens en aval).
  async completeLogin(
    tenant: Tenant,
    redirectUri: string,
    code: string,
    state: string,
    session: OidcSession,
  ) {
    if (session.tenantId !== tenant.id) {
      throw new UnauthorizedException('Session SSO sur le mauvais tenant');
    }
    if (session.state !== state) {
      throw new UnauthorizedException('State SSO invalide (suspicion CSRF)');
    }

    const client = await this.buildClient(tenant.id, redirectUri);
    let tokenSet;
    try {
      tokenSet = await client.callback(
        redirectUri,
        { code, state },
        { state: session.state, nonce: session.nonce, code_verifier: session.codeVerifier },
      );
    } catch (err: any) {
      throw new UnauthorizedException('Echange code OIDC echec : ' + err.message);
    }

    const claims = tokenSet.claims();
    const sub = claims.sub;
    const issuer = claims.iss;
    const email = (claims.email as string | undefined)?.toLowerCase();
    const firstName = (claims.given_name as string | undefined) ?? '';
    const lastName = (claims.family_name as string | undefined) ?? (claims.name as string | undefined) ?? email ?? sub;

    if (!sub || !issuer) {
      throw new UnauthorizedException('Claims OIDC incompletes (sub/iss manquants)');
    }

    // 1. Matche un user existant par (tenantId, ssoIssuer, ssoSubject)
    let user = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, ssoIssuer: issuer, ssoSubject: sub },
    });

    // 2. Sinon matche par (tenantId, email) — premier login d'un user deja
    //    existant en local : on attache l'identite SSO a son compte.
    if (!user && email) {
      user = await this.prisma.user.findFirst({
        where: { tenantId: tenant.id, email },
      });
      if (user) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { ssoIssuer: issuer, ssoSubject: sub },
        });
        this.logger.log(`SSO : compte local existant (${email}) lie a l'identite ${issuer}#${sub}`);
      }
    }

    // 3. JIT provisioning si autorise et pas trouve
    if (!user) {
      const jit = await this.settings.getBool('sso.allowJitProvisioning', tenant.id);
      if (!jit) {
        throw new UnauthorizedException(
          'Utilisateur inconnu et provisioning JIT desactive. Demandez a l\'admin de creer votre compte.',
        );
      }
      if (!email) {
        throw new UnauthorizedException(
          'JIT impossible : l\'IdP ne retourne pas d\'email. Demandez le scope "email" cote IdP.',
        );
      }
      const role = ((await this.settings.get('sso.defaultRole', tenant.id)) ?? 'SALES').toUpperCase();
      // Password placeholder : hash bcrypt d'une chaine aleatoire 32 chars.
      // Aucun login local possible avec ce password (jamais expose au user).
      const placeholderPwd = randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(placeholderPwd, 10);
      user = await this.prisma.user.create({
        data: {
          tenantId: tenant.id,
          email,
          firstName: firstName || email.split('@')[0],
          lastName,
          role: role as any,
          passwordHash,
          ssoIssuer: issuer,
          ssoSubject: sub,
          isActive: true,
        },
      });
      this.logger.log(`SSO JIT : nouveau user cree ${email} (role ${role}) dans tenant ${tenant.slug}`);
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Utilisateur desactive');
    }

    // Capture du refresh token delegue M365 (envoi mail « au nom » de l'agent).
    // NON BLOQUANT : un echec ici ne doit jamais empecher le login. Gate sur
    // mail.delegatedEnabled + presence d'un refresh_token (scope offline_access).
    try {
      if (
        (tokenSet as any).refresh_token &&
        (await this.settings.getBool('mail.delegatedEnabled', tenant.id))
      ) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            m365RefreshTokenEnc: encryptSecret((tokenSet as any).refresh_token as string),
            m365TokenUpdatedAt: new Date(),
          },
        });
        this.logger.log('SSO : refresh token M365 delegue capture pour ' + user.email);
      }
    } catch (err: any) {
      this.logger.warn('Capture refresh token M365 echec (non bloquant) : ' + err.message);
    }

    // Trace audit
    await this.prisma.activity.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        action: 'LOGIN_SSO',
        entity: 'User',
        entityId: user.id,
        metadata: { issuer, sub: sub.slice(0, 16) + '...' },
      },
    }).catch(() => {});

    return user;
  }
}
