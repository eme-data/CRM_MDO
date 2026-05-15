import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash, createHmac, randomBytes } from 'crypto';
import { Prisma, WebhookEvent } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { assertSafePublicUrl } from '../common/http/safe-fetch';

export const WEBHOOKS_QUEUE = 'webhooks';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(WEBHOOKS_QUEUE) private readonly queue: Queue,
  ) {}

  // ============================================================
  // CRUD endpoints
  // ============================================================
  list(params: { companyId?: string; isActive?: boolean } = {}) {
    return this.prisma.webhookEndpoint.findMany({
      where: {
        ...(params.companyId !== undefined ? { companyId: params.companyId } : {}),
        ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      },
      include: {
        company: { select: { id: true, name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { deliveries: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const e = await this.prisma.webhookEndpoint.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        deliveries: { orderBy: { createdAt: 'desc' }, take: 30 },
      },
    });
    if (!e) throw new NotFoundException('Webhook introuvable');
    return e;
  }

  async create(input: {
    url: string;
    description?: string;
    events: WebhookEvent[];
    companyId?: string;
  }, userId: string) {
    if (!input.url.startsWith('https://')) {
      throw new BadRequestException('URL doit etre HTTPS');
    }
    if (!input.events || input.events.length === 0) {
      throw new BadRequestException('Au moins un event a souscrire');
    }
    // Anti-SSRF : refuse les URLs vers IP privee (ex. 169.254.169.254 metadata
    // cloud, 127.0.0.1, services LAN). Recheck a chaque delivery contre le
    // DNS rebinding (cf processDelivery).
    await assertSafePublicUrl(input.url);
    const secret = 'whsec_' + randomBytes(24).toString('base64url');
    return this.prisma.webhookEndpoint.create({
      data: {
        url: input.url,
        description: input.description,
        events: input.events,
        companyId: input.companyId,
        secret,
        createdById: userId,
      },
    });
  }

  async update(id: string, input: Partial<{
    url: string;
    description: string | null;
    events: WebhookEvent[];
    isActive: boolean;
  }>) {
    await this.findOne(id);
    const data: Prisma.WebhookEndpointUpdateInput = {};
    if (input.url !== undefined) {
      if (!input.url.startsWith('https://')) throw new BadRequestException('URL doit etre HTTPS');
      await assertSafePublicUrl(input.url);
      data.url = input.url;
    }
    if (input.description !== undefined) data.description = input.description;
    if (input.events !== undefined) data.events = { set: input.events };
    if (input.isActive !== undefined) data.isActive = input.isActive;
    return this.prisma.webhookEndpoint.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.webhookEndpoint.delete({ where: { id } });
    return { ok: true };
  }

  async regenerateSecret(id: string) {
    await this.findOne(id);
    const secret = 'whsec_' + randomBytes(24).toString('base64url');
    await this.prisma.webhookEndpoint.update({ where: { id }, data: { secret } });
    // On expose le nouveau secret au caller — UI doit l'afficher une fois
    return { secret };
  }

  // ============================================================
  // EMIT — appele par les services metier (TicketService.create, etc.)
  // Trouve les endpoints qui souscrivent a l'event + queue les deliveries.
  // companyId : si l'event concerne un client specifique, ne fanout que vers
  // les endpoints scoped a ce client + les endpoints globaux.
  // ============================================================
  async emit(event: WebhookEvent, payload: Record<string, any>, companyId?: string) {
    const where: Prisma.WebhookEndpointWhereInput = {
      isActive: true,
      events: { has: event },
      ...(companyId
        ? { OR: [{ companyId }, { companyId: null }] }
        : { companyId: null }),
    };
    const endpoints = await this.prisma.webhookEndpoint.findMany({ where });
    if (endpoints.length === 0) return { delivered: 0 };
    // Cree les deliveries et queue
    const enrichedPayload = {
      event,
      occurredAt: new Date().toISOString(),
      data: payload,
    };
    for (const ep of endpoints) {
      const delivery = await this.prisma.webhookDelivery.create({
        data: { endpointId: ep.id, event, payload: enrichedPayload as any },
      });
      // Backoff exponentiel : 1s, 5s, 30s, 5min, 30min — gere par BullMQ
      await this.queue.add(
        'deliver',
        { deliveryId: delivery.id, endpointId: ep.id, payload: enrichedPayload, secret: ep.secret, url: ep.url },
        { attempts: 5, backoff: { type: 'exponential', delay: 1000 } },
      );
    }
    return { delivered: endpoints.length };
  }

  // ============================================================
  // Process a delivery (appele par le worker BullMQ)
  // ============================================================
  async processDelivery(deliveryId: string, url: string, payload: any, secret: string): Promise<{ ok: boolean; httpStatus: number; body: string }> {
    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    const start = Date.now();
    let httpStatus = 0;
    let responseBody = '';
    let error: string | null = null;
    try {
      // Recheck anti-SSRF a la livraison : un endpoint cree avant l'ajout du
      // garde-fou peut etre malveillant, et un DNS rebinding peut faire
      // pointer un domaine public vers une IP privee entre 2 deliveries.
      await assertSafePublicUrl(url);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': 'sha256=' + signature,
          'X-Webhook-Event': payload.event,
          'User-Agent': 'CRM-MDO-Webhooks/1.0',
        },
        body,
        // redirect: 'manual' empeche fetch de suivre une redirection vers
        // une IP interne (ex. 302 -> http://169.254.169.254).
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
      });
      httpStatus = res.status;
      responseBody = (await res.text()).slice(0, 2000);
      if (!res.ok) error = 'HTTP ' + httpStatus;
    } catch (err: any) {
      error = err.message;
    }
    const ok = !error && httpStatus >= 200 && httpStatus < 300;
    // Update delivery + miroirs sur endpoint
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        httpStatus: httpStatus || null,
        responseBody: responseBody || null,
        attemptCount: { increment: 1 },
        ...(ok ? { succeededAt: new Date() } : {}),
        errorMessage: error,
      },
    });
    const delivery = await this.prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
    if (delivery) {
      await this.prisma.webhookEndpoint.update({
        where: { id: delivery.endpointId },
        data: {
          lastDeliveryAt: new Date(),
          ...(ok
            ? { lastSuccessAt: new Date(), successCount: { increment: 1 } }
            : { failureCount: { increment: 1 } }),
        },
      });
    }
    if (!ok) throw new Error(error ?? 'HTTP ' + httpStatus); // BullMQ retentera
    return { ok, httpStatus, body: responseBody };
  }

  // Marque une delivery comme failed permanently apres epuisement des retries
  async markPermanentlyFailed(deliveryId: string, error: string) {
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { failedPermanentlyAt: new Date(), errorMessage: error.slice(0, 500) },
    });
  }
}
