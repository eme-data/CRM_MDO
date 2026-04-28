import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';

// Generation iCalendar (RFC 5545) pour les interventions d'un utilisateur.
// Pas de dependance externe - le format est suffisamment simple. Encode les
// caracteres speciaux et folde les lignes a 75 octets comme exige.
@Injectable()
export class IcalService {
  constructor(private readonly prisma: PrismaService) {}

  // Recupere ou genere un token iCal opaque pour l'utilisateur. Stocke en clair
  // car ce token donne acces uniquement aux interventions de l'utilisateur en
  // lecture (pas d'auth full). L'utilisateur peut le regenerer pour invalider
  // les anciens flux.
  async getOrCreateToken(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { icalToken: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    if (user.icalToken) return user.icalToken;
    const token = randomBytes(24).toString('hex');
    await this.prisma.user.update({ where: { id: userId }, data: { icalToken: token } });
    return token;
  }

  async regenerateToken(userId: string): Promise<string> {
    const token = randomBytes(24).toString('hex');
    await this.prisma.user.update({ where: { id: userId }, data: { icalToken: token } });
    return token;
  }

  async revokeToken(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { icalToken: null } });
  }

  // Genere le flux .ics pour l'utilisateur identifie par son token. Le token
  // doit etre verifie par le controller avant d'appeler cette methode.
  async buildIcsForToken(token: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { icalToken: token },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!user) throw new NotFoundException('Token iCal invalide');

    // Fenetre : -30 jours / +180 jours, suffisant pour la plupart des
    // calendriers et evite de pousser tout l'historique a chaque sync.
    const since = new Date(Date.now() - 30 * 24 * 3600_000);
    const until = new Date(Date.now() + 180 * 24 * 3600_000);

    const interventions = await this.prisma.intervention.findMany({
      where: {
        technicianId: user.id,
        scheduledAt: { gte: since, lte: until },
      },
      include: {
        company: { select: { name: true, address: true, postalCode: true, city: true } },
        contract: { select: { reference: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    return this.formatIcs(interventions, user);
  }

  private formatIcs(
    items: any[],
    user: { email: string; firstName: string; lastName: string },
  ): string {
    const now = this.toIcalDate(new Date());
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MDO Services//CRM Interventions//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:CRM MDO - Interventions ${user.firstName} ${user.lastName}`.slice(0, 75),
      'X-WR-TIMEZONE:Europe/Paris',
    ];
    for (const i of items) {
      const start = i.startedAt ?? i.scheduledAt;
      // Duree par defaut : 1h si pas de endedAt
      const end =
        i.endedAt ?? new Date(new Date(start).getTime() + (i.durationMin ?? 60) * 60_000);
      const summary =
        '[' + (i.type ?? 'INTERVENTION') + '] ' + (i.title ?? '(sans titre)') +
        (i.company?.name ? ' - ' + i.company.name : '');
      const locationParts = [
        i.company?.address,
        [i.company?.postalCode, i.company?.city].filter(Boolean).join(' '),
      ].filter(Boolean);
      const description = [
        i.description ?? '',
        i.contract?.reference ? '\nContrat : ' + i.contract.reference : '',
        i.report ? '\n\nCompte-rendu :\n' + i.report : '',
      ].join('');

      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + i.id + '@crm.mdoservices.fr');
      lines.push('DTSTAMP:' + now);
      lines.push('DTSTART:' + this.toIcalDate(new Date(start)));
      lines.push('DTEND:' + this.toIcalDate(new Date(end)));
      lines.push(this.fold('SUMMARY:' + this.escape(summary)));
      if (locationParts.length) {
        lines.push(this.fold('LOCATION:' + this.escape(locationParts.join(', '))));
      }
      if (description.trim()) {
        lines.push(this.fold('DESCRIPTION:' + this.escape(description)));
      }
      lines.push('STATUS:' + this.statusToIcal(i.status));
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  private toIcalDate(d: Date): string {
    // Format iCalendar UTC : YYYYMMDDTHHMMSSZ
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  }

  private escape(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  // RFC 5545 §3.1 : lignes pliees a 75 octets max, continuation prefixee d'un espace.
  private fold(line: string): string {
    if (line.length <= 75) return line;
    const chunks: string[] = [];
    let i = 0;
    while (i < line.length) {
      chunks.push((i === 0 ? '' : ' ') + line.slice(i, i + (i === 0 ? 75 : 74)));
      i += i === 0 ? 75 : 74;
    }
    return chunks.join('\r\n');
  }

  private statusToIcal(status: string): string {
    switch (status) {
      case 'PLANNED':
        return 'TENTATIVE';
      case 'IN_PROGRESS':
      case 'DONE':
        return 'CONFIRMED';
      case 'CANCELLED':
        return 'CANCELLED';
      default:
        return 'TENTATIVE';
    }
  }
}
