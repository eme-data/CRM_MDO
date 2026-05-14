import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import { CreateLeadDto } from './dto/create-lead.dto';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Cree (ou met a jour) un Lead depuis le form public www.mdoservices.fr/contact
   * ou autre source externe. Strategie :
   *   1. Honeypot rempli -> return ok silencieux (pas d'enreg, on ne signale pas)
   *   2. Si une Company existe deja avec ce nom OU email correspondant -> on
   *      log juste une Activity pour ne pas creer de doublon
   *   3. Sinon -> creation Company (status LEAD) + Contact + Activity
   *   4. Notification in-app aux ADMIN + MANAGER pour visibilite immediate
   *   5. Email de confirmation auto si SMTP configure
   */
  async createFromPublic(
    dto: CreateLeadDto,
    ctx: { ip?: string; userAgent?: string } = {},
  ): Promise<{ ok: true; deduplicated?: boolean }> {
    // Honeypot : champ website rempli = bot → on retourne ok silencieux pour
    // ne pas leak la detection. Validation DTO devrait deja rejeter, mais
    // defense en profondeur ici.
    if (dto.website && dto.website.length > 0) {
      this.logger.warn(`Lead honeypot trigger ip=${ctx.ip ?? '?'}`);
      return { ok: true, deduplicated: true };
    }

    const cleanEmail = dto.email.trim().toLowerCase();
    const cleanName = (dto.company || dto.name).trim();
    const source = (dto.source || 'website').slice(0, 60);

    // Deduplication legere : on cherche une Company avec ce nom ou un Contact
    // avec cet email. Si trouve, on ajoute juste une Activity au lieu de
    // recreer un doublon.
    const existingCompany = await this.prisma.company.findFirst({
      where: {
        OR: [
          { name: { equals: cleanName, mode: 'insensitive' } },
          { contacts: { some: { email: { equals: cleanEmail, mode: 'insensitive' } } } },
          { email: { equals: cleanEmail, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, status: true },
    });

    if (existingCompany) {
      // Lead deja connu : on ajoute une Activity de re-contact pour visibilite
      await this.prisma.activity.create({
        data: {
          // System user : pas de userId reel → on utilise un placeholder.
          // Si pas d'admin existant on log juste sans Activity (cas seed initial).
          userId: await this.getSystemUserId(),
          action: 'LEAD_RECONTACT',
          entity: 'Company',
          entityId: existingCompany.id,
          metadata: {
            source,
            message: dto.message.slice(0, 500),
            ip: ctx.ip?.slice(0, 64),
          },
        },
      });
      this.logger.log(`Lead re-contact: ${existingCompany.name} (${existingCompany.id})`);
      await this.notifyAdmins(
        `Lead re-contact : ${existingCompany.name}`,
        `${cleanEmail} via ${source}`,
        existingCompany.id,
      );
      return { ok: true, deduplicated: true };
    }

    // Nouveau lead : on cree Company LEAD + Contact + Activity en transaction
    const created = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: cleanName,
          status: 'LEAD',
          email: cleanEmail,
          phone: dto.phone?.trim() || null,
          notes: 'Source : ' + source + '\n\nMessage initial :\n' + dto.message,
        },
      });

      // Decompose name en first/last : split sur le premier espace, fallback
      // sur "Lead" si le nom est mono-mot (ex. juste un prenom).
      const parts = dto.name.trim().split(/\s+/);
      const firstName = parts[0] ?? 'Lead';
      const lastName = parts.slice(1).join(' ') || cleanName;

      await tx.contact.create({
        data: {
          firstName,
          lastName,
          email: cleanEmail,
          phone: dto.phone?.trim() || null,
          isPrimary: true,
          companyId: company.id,
        },
      });

      await tx.activity.create({
        data: {
          userId: await this.getSystemUserId(),
          action: 'LEAD_CREATED',
          entity: 'Company',
          entityId: company.id,
          metadata: {
            source,
            ip: ctx.ip?.slice(0, 64),
            userAgent: ctx.userAgent?.slice(0, 256),
          },
        },
      });

      return company;
    });

    this.logger.log(`Lead cree: ${created.name} (${created.id}) source=${source}`);
    await this.notifyAdmins(
      `Nouveau lead : ${created.name}`,
      `${cleanEmail} via ${source}`,
      created.id,
    );

    // Email de confirmation au prospect (best-effort, non bloquant)
    this.sendConfirmation(cleanEmail, dto.name).catch((err) =>
      this.logger.warn('Email confirmation lead echec : ' + err.message),
    );

    return { ok: true };
  }

  /**
   * Recupere l'ID du premier ADMIN actif pour rattacher les Activity creees
   * par le flow public (pas d'utilisateur authentifie). En l'absence d'ADMIN,
   * on tente un MANAGER, puis n'importe quel User. Si rien -> erreur explicite
   * (CRM non encore seede : situation impossible en prod, OK en tests).
   */
  private cachedSystemUserId: string | null = null;
  private async getSystemUserId(): Promise<string> {
    if (this.cachedSystemUserId) return this.cachedSystemUserId;
    const user = await this.prisma.user.findFirst({
      where: { isActive: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    if (!user) {
      throw new Error('Aucun utilisateur dans le CRM pour rattacher l Activity lead');
    }
    this.cachedSystemUserId = user.id;
    return user.id;
  }

  private async notifyAdmins(title: string, body: string, companyId: string) {
    const admins = await this.prisma.user.findMany({
      where: { isActive: true, role: { in: ['ADMIN', 'MANAGER'] } },
      select: { id: true },
    });
    await Promise.all(
      admins.map((u) =>
        this.notifications.push({
          userId: u.id,
          type: 'GENERIC',
          title,
          body,
          entity: 'Company',
          entityId: companyId,
          url: '/companies/' + companyId,
        }),
      ),
    );
  }

  private async sendConfirmation(toEmail: string, name: string) {
    const enabled = await this.settings.getBool('leads.confirmationEmail.enabled');
    if (!enabled) return;
    const html = `
      <p>Bonjour ${this.escapeHtml(name)},</p>
      <p>Merci pour votre demande. Un membre de MDO Services vous recontactera sous 24h ouvrees.</p>
      <p style="color:#64748b;font-size:13px">A bientot,<br>L'equipe MDO Services</p>
    `;
    await this.mail.send({
      to: toEmail,
      subject: 'Votre demande a bien ete recue — MDO Services',
      html,
      relatedEntity: 'Lead',
    });
  }

  private escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c] as string));
  }
}
