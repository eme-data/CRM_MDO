import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { CallDirection, CallStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { normalizePhoneFR, phoneSearchVariants } from './phone.utils';

@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  // ============================================================
  // Resolution numero -> Contact + Company
  // ============================================================
  async resolvePhone(rawNumber: string): Promise<{ contactId?: string; companyId?: string }> {
    const normalized = normalizePhoneFR(rawNumber);
    if (!normalized) return {};
    const variants = phoneSearchVariants(normalized);

    // Match contact prioritaire (phone OR mobile)
    const contact = await this.prisma.contact.findFirst({
      where: {
        OR: [
          { phone: { in: variants } },
          { mobile: { in: variants } },
        ],
      },
      select: { id: true, companyId: true },
    });
    if (contact) {
      return { contactId: contact.id, companyId: contact.companyId ?? undefined };
    }
    // Sinon match company
    const company = await this.prisma.company.findFirst({
      where: { phone: { in: variants } },
      select: { id: true },
    });
    if (company) return { companyId: company.id };
    return {};
  }

  // ============================================================
  // Click-to-call : declenche un appel sortant
  // - TEL_URI : pas d'appel cote serveur, le frontend ouvre tel:URI directement
  //   (on log juste la tentative pour avoir l'historique).
  // - FREE_PRO : POST vers l'API Coms Pro pour faire sonner le poste de l'user
  //   puis composer le numero distant.
  // ============================================================
  async clickToCall(toRawNumber: string, userId: string) {
    const provider = (await this.settings.get('voip.provider')) ?? 'TEL_URI';
    const normalized = normalizePhoneFR(toRawNumber);
    if (!normalized) throw new BadRequestException('Numero invalide : ' + toRawNumber);

    const callerId = (await this.settings.get('voip.freepro.callerId')) ?? '';
    const resolved = await this.resolvePhone(normalized);

    let externalId: string | undefined;
    let status: CallStatus = 'RINGING';

    if (provider === 'FREE_PRO') {
      const apiUrl = await this.settings.get('voip.freepro.apiUrl');
      const apiKey = await this.settings.get('voip.freepro.apiKey');
      if (!apiUrl || !apiKey) {
        throw new BadRequestException('Free PRO selectionne mais apiUrl/apiKey non configures');
      }
      try {
        // Endpoint generique : la doc Coms Pro varie selon les contrats
        // (POST /click2call ou similaire). Adapter au besoin via setting.
        const res = await fetch(apiUrl.replace(/\/$/, '') + '/click2call', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: callerId, to: normalized }),
        });
        if (!res.ok) {
          this.logger.warn('Free PRO click2call HTTP ' + res.status);
          status = 'FAILED';
        } else {
          const j: any = await res.json().catch(() => ({}));
          externalId = j?.call_id ?? j?.id;
        }
      } catch (err: any) {
        this.logger.warn('Free PRO click2call exception : ' + err.message);
        status = 'FAILED';
      }
    }

    const log = await this.prisma.callLog.create({
      data: {
        direction: CallDirection.OUTBOUND,
        status,
        fromNumber: callerId || 'MDO',
        toNumber: normalized,
        userId,
        contactId: resolved.contactId,
        companyId: resolved.companyId,
        provider,
        externalId,
      },
    });
    return log;
  }

  // ============================================================
  // Webhook : reception d'un evenement d'appel (entrant ou sortant)
  // ============================================================
  async handleWebhook(provider: string, rawBody: Buffer, signatureHeader: string | undefined) {
    if (provider.toLowerCase() === 'free_pro' || provider.toLowerCase() === 'freepro') {
      return this.handleFreeProWebhook(rawBody, signatureHeader);
    }
    throw new BadRequestException('Provider VoIP inconnu : ' + provider);
  }

  private async handleFreeProWebhook(rawBody: Buffer, signatureHeader: string | undefined) {
    const secret = await this.settings.get('voip.freepro.webhookSecret');
    if (secret) {
      if (!signatureHeader) throw new BadRequestException('Signature webhook manquante');
      const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
      try {
        const a = Buffer.from(expected, 'hex');
        const b = Buffer.from(signatureHeader.replace(/^sha256=/, ''), 'hex');
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          throw new BadRequestException('Signature webhook invalide');
        }
      } catch (err: any) {
        throw new BadRequestException('Signature webhook invalide : ' + err.message);
      }
    }

    let payload: any;
    try { payload = JSON.parse(rawBody.toString('utf-8')); }
    catch { throw new BadRequestException('Payload non JSON'); }

    // Schema attendu (a confirmer avec doc exacte Free PRO) :
    // {
    //   event: "call.started" | "call.answered" | "call.ended",
    //   call_id: "uuid",
    //   direction: "inbound"|"outbound",
    //   from: "+33...",
    //   to: "+33...",
    //   status: "ringing"|"answered"|"missed"|"busy"|"failed"|"completed",
    //   started_at, answered_at, ended_at, duration_sec
    // }

    const externalId: string | undefined = payload.call_id ?? payload.id;
    if (!externalId) {
      this.logger.warn('Free PRO webhook sans call_id : ' + JSON.stringify(payload).slice(0, 200));
      return { ok: false };
    }

    const direction: CallDirection = payload.direction === 'outbound' ? 'OUTBOUND' : 'INBOUND';
    const fromNumber = normalizePhoneFR(payload.from) ?? payload.from ?? 'unknown';
    const toNumber = normalizePhoneFR(payload.to) ?? payload.to ?? 'unknown';
    const status = (String(payload.status ?? 'completed').toUpperCase() as CallStatus);

    // Numero a resoudre (l'externe pour entrant, le distant pour sortant)
    const partyToResolve = direction === 'INBOUND' ? fromNumber : toNumber;
    const resolved = await this.resolvePhone(partyToResolve);

    // Upsert : si externalId deja vu, on update (transitions ringing->answered->ended)
    const existing = await this.prisma.callLog.findUnique({ where: { externalId } });
    if (existing) {
      const updated = await this.prisma.callLog.update({
        where: { id: existing.id },
        data: {
          status,
          answeredAt: payload.answered_at ? new Date(payload.answered_at) : existing.answeredAt,
          endedAt: payload.ended_at ? new Date(payload.ended_at) : existing.endedAt,
          durationSec: payload.duration_sec ?? existing.durationSec,
          recordingUrl: payload.recording_url ?? existing.recordingUrl,
          rawPayload: payload,
        },
      });
      return { ok: true, callLogId: updated.id, action: 'updated' };
    }

    const created = await this.prisma.callLog.create({
      data: {
        direction,
        status,
        fromNumber,
        toNumber,
        startedAt: payload.started_at ? new Date(payload.started_at) : new Date(),
        answeredAt: payload.answered_at ? new Date(payload.answered_at) : null,
        endedAt: payload.ended_at ? new Date(payload.ended_at) : null,
        durationSec: payload.duration_sec ?? null,
        recordingUrl: payload.recording_url ?? null,
        contactId: resolved.contactId,
        companyId: resolved.companyId,
        provider: 'FREE_PRO',
        externalId,
        rawPayload: payload,
      },
    });
    return { ok: true, callLogId: created.id, action: 'created' };
  }

  // ============================================================
  // CRUD lecture
  // ============================================================
  async findAll(params: {
    contactId?: string;
    companyId?: string;
    userId?: string;
    direction?: CallDirection;
  }) {
    const where: Prisma.CallLogWhereInput = {};
    if (params.contactId) where.contactId = params.contactId;
    if (params.companyId) where.companyId = params.companyId;
    if (params.userId) where.userId = params.userId;
    if (params.direction) where.direction = params.direction;
    return this.prisma.callLog.findMany({
      where,
      include: {
        contact: { select: { id: true, firstName: true, lastName: true } },
        company: { select: { id: true, name: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string) {
    const c = await this.prisma.callLog.findUnique({
      where: { id },
      include: {
        contact: true,
        company: { select: { id: true, name: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!c) throw new NotFoundException('Appel introuvable');
    return c;
  }

  async addNote(id: string, notes: string) {
    await this.findOne(id);
    return this.prisma.callLog.update({ where: { id }, data: { notes } });
  }

  // ============================================================
  // Stats simples (dashboard)
  // ============================================================
  async stats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [todayCount, missedCount, last7d] = await Promise.all([
      this.prisma.callLog.count({ where: { startedAt: { gte: today } } }),
      this.prisma.callLog.count({
        where: { startedAt: { gte: today }, status: 'MISSED', direction: 'INBOUND' },
      }),
      this.prisma.callLog.count({
        where: { startedAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
      }),
    ]);
    return { today: todayCount, todayMissedInbound: missedCount, last7d };
  }
}
