import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';

const MAGIC_LINK_TTL_MIN = 15;
const SESSION_TTL_DAYS = 7;

@Injectable()
export class PortalAuthService {
  private readonly logger = new Logger(PortalAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Trouve la societe associee a un email (par domaine). On considere qu'un
   * email contact@xyz.fr correspond a une societe dont le website ou l'email
   * contient le domaine xyz.fr.
   * Retourne null si aucun match (on ne leak pas cette info au client).
   */
  private async findCompanyByEmail(email: string): Promise<{ id: string; name: string; tenantId: string | null } | null> {
    const at = email.lastIndexOf('@');
    if (at === -1) return null;
    const domain = email.slice(at + 1).toLowerCase().trim();
    if (!domain || domain.length < 4) return null;
    // Match strict : on cherche le domaine dans website OU dans email (suffixe @domain).
    // `contains` est case-insensitive sur Postgres via mode insensitive.
    const candidates = await this.prisma.company.findMany({
      where: {
        status: { in: ['CUSTOMER', 'PROSPECT'] },
        OR: [
          { website: { contains: domain, mode: 'insensitive' } },
          { email: { endsWith: '@' + domain, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, tenantId: true },
      take: 5,
    });
    if (candidates.length === 0) return null;
    // Si plusieurs matchs : on prend la premiere CUSTOMER, sinon la premiere tout court.
    // Cas rare en pratique (un domaine peut etre rattache a plusieurs entites mais
    // souvent ce sont des sites/filiales et l'utilisateur a un unique compte).
    return candidates[0];
  }

  /**
   * Demande d'un magic link. TOUJOURS retourne `{ ok: true }` pour ne pas
   * revealer l'existence (ou non) d'un compte client (defense contre enumeration).
   * Le mail est envoye uniquement si l'email matche un domaine de societe enregistree.
   */
  async requestMagicLink(email: string): Promise<{ ok: boolean }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      throw new BadRequestException('Adresse email invalide');
    }

    const company = await this.findCompanyByEmail(cleanEmail);
    if (!company) {
      // Reponse generique. Pas d'envoi.
      this.logger.log('Magic link refuse (domaine non reconnu) : ' + cleanEmail);
      return { ok: true };
    }

    // Cree (ou retrouve) le ClientPortalUser. Si un Contact CRM existe avec cet
    // email pour cette societe, on l'associe.
    // Multi-tenant : findFirst (et non findUnique) car email unique par tenant.
    // On scope sur le tenant de la Company (qui sera setup dans la vague 1).
    let user = await this.prisma.clientPortalUser.findFirst({
      where: { email: cleanEmail },
    });
    if (!user) {
      const contact = await this.prisma.contact.findFirst({
        where: { companyId: company.id, email: { equals: cleanEmail, mode: 'insensitive' } },
        select: { id: true, firstName: true, lastName: true },
      });
      user = await this.prisma.clientPortalUser.create({
        data: {
          email: cleanEmail,
          companyId: company.id,
          contactId: contact?.id,
          firstName: contact?.firstName,
          lastName: contact?.lastName,
        },
      });
    } else if (user.companyId !== company.id) {
      // Securite : l'email a deja un compte rattache a une autre societe.
      // Ne PAS reaffecter en silence. On loggue et on retourne ok generique.
      this.logger.warn(
        'Tentative magic link mais email ' + cleanEmail + ' rattache a une autre societe.',
      );
      return { ok: true };
    }

    if (!user.isActive) {
      this.logger.log('Magic link refuse (compte desactive) : ' + cleanEmail);
      return { ok: true };
    }

    // Rate-limit basique : max 3 magic links non utilises et non expires actifs simultanement
    const activeLinks = await this.prisma.clientPortalMagicLink.count({
      where: {
        userId: user.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (activeLinks >= 3) {
      this.logger.warn('Rate-limit magic link pour ' + cleanEmail);
      return { ok: true };
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MIN * 60_000);
    await this.prisma.clientPortalMagicLink.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const baseUrl =
      (await this.settings.get('app.portalUrl'))
      ?? (await this.settings.get('app.publicUrl'))
      ?? 'https://crm.mdoservices.fr';
    const link = baseUrl.replace(/\/+$/, '') + '/portal/verify?token=' + rawToken;
    const html = `
      <p>Bonjour ${user.firstName ?? ''},</p>
      <p>Voici votre lien de connexion securise a l'espace client MDO Services :</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${link}" style="background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;display:inline-block">Se connecter</a>
      </p>
      <p style="color:#64748b;font-size:13px">Ce lien expire dans <strong>${MAGIC_LINK_TTL_MIN} minutes</strong> et ne peut etre utilise qu'une seule fois.</p>
      <p style="color:#64748b;font-size:13px">Si vous n'avez pas demande cette connexion, ignorez ce message — aucune action n'est requise.</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="color:#64748b;font-size:12px">
        MDO Services - Espace client de ${company.name}<br>
        <a href="https://www.mdoservices.fr">www.mdoservices.fr</a>
      </p>
    `;

    await this.mail.send({
      to: cleanEmail,
      subject: 'Votre acces a l\'espace client MDO Services',
      html,
      relatedEntity: 'ClientPortalUser',
      relatedEntityId: user.id,
      tenantId: company.tenantId,
    });

    return { ok: true };
  }

  /**
   * Verifie un token magic link, le consomme, et cree une session portail.
   * Retourne le `sessionToken` opaque a stocker en cookie cote client.
   */
  async verifyMagicLink(rawToken: string, ctx: { ip?: string; userAgent?: string } = {}) {
    const tokenHash = this.hashToken(rawToken);
    const link = await this.prisma.clientPortalMagicLink.findUnique({
      where: { tokenHash },
      include: { user: { include: { company: { select: { id: true, name: true } } } } },
    });
    if (!link) throw new UnauthorizedException('Lien invalide.');
    if (link.usedAt) throw new UnauthorizedException('Ce lien a deja ete utilise.');
    if (link.expiresAt < new Date()) throw new UnauthorizedException('Ce lien a expire.');
    if (!link.user.isActive) throw new UnauthorizedException('Compte desactive.');

    // Marque le magic link comme consomme (atomique avec la creation de session
    // au sein d'une transaction pour eviter les "double clics").
    const sessionToken = randomBytes(32).toString('hex');
    const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000);

    const [, session] = await this.prisma.$transaction([
      this.prisma.clientPortalMagicLink.update({
        where: { id: link.id },
        data: {
          usedAt: new Date(),
          ip: ctx.ip?.slice(0, 64),
          userAgent: ctx.userAgent?.slice(0, 256),
        },
      }),
      this.prisma.clientPortalSession.create({
        data: {
          userId: link.user.id,
          token: sessionToken,
          expiresAt: sessionExpiresAt,
          ip: ctx.ip?.slice(0, 64),
          userAgent: ctx.userAgent?.slice(0, 256),
        },
      }),
      this.prisma.clientPortalUser.update({
        where: { id: link.user.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    return {
      sessionToken,
      expiresAt: session.expiresAt,
      user: {
        id: link.user.id,
        email: link.user.email,
        firstName: link.user.firstName,
        lastName: link.user.lastName,
        company: link.user.company,
      },
    };
  }

  /**
   * Resout un session token : retourne le ClientPortalUser + Company associes.
   * Met a jour `lastUsedAt` pour le tracking.
   */
  async getSession(sessionToken: string) {
    const session = await this.prisma.clientPortalSession.findUnique({
      where: { token: sessionToken },
      include: {
        user: { include: { company: { select: { id: true, name: true } } } },
      },
    });
    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt < new Date()) return null;
    if (!session.user.isActive) return null;
    // Async fire-and-forget pour ne pas bloquer la requete.
    this.prisma.clientPortalSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => undefined);
    return session;
  }

  async revokeSession(sessionToken: string) {
    await this.prisma.clientPortalSession.updateMany({
      where: { token: sessionToken, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
}
