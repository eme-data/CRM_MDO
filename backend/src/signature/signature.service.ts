import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, SignatureProvider, SignatureStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { PdfService } from '../pdf/pdf.service';
import { DocuSealProvider } from './providers/docuseal.provider';
import { YousignProvider } from './providers/yousign.provider';
import {
  NormalizedWebhookEvent,
  SignatureProviderApi,
} from './providers/signature-provider.interface';

export type SignableEntityType = 'Quote' | 'Contract';

@Injectable()
export class SignatureService {
  private readonly logger = new Logger(SignatureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly pdf: PdfService,
  ) {}

  // ============================================================
  // Resolution du provider actif (selon Settings)
  // ============================================================
  async getActiveProvider(): Promise<SignatureProviderApi | null> {
    const kind = await this.settings.get('signature.provider');
    if (!kind || kind === 'DISABLED') return null;
    if (kind === 'DOCUSEAL') {
      const apiUrl = await this.settings.get('signature.docuseal.apiUrl');
      const apiKey = await this.settings.get('signature.docuseal.apiKey');
      const webhookSecret = await this.settings.get('signature.docuseal.webhookSecret');
      if (!apiUrl || !apiKey) {
        throw new BadRequestException('DocuSeal selectionne mais apiUrl/apiKey non configures');
      }
      return new DocuSealProvider({ apiUrl, apiKey, webhookSecret: webhookSecret ?? undefined });
    }
    if (kind === 'YOUSIGN') {
      const apiUrl = await this.settings.get('signature.yousign.apiUrl');
      const apiKey = await this.settings.get('signature.yousign.apiKey');
      const webhookSecret = await this.settings.get('signature.yousign.webhookSecret');
      if (!apiUrl || !apiKey) {
        throw new BadRequestException('Yousign selectionne mais apiUrl/apiKey non configures');
      }
      return new YousignProvider({ apiUrl, apiKey, webhookSecret: webhookSecret ?? undefined });
    }
    throw new BadRequestException('Provider de signature inconnu : ' + kind);
  }

  // Resout un provider precis pour les webhooks (le payload arrive avec
  // /webhook/docuseal ou /webhook/yousign — on n'utilise pas le setting
  // global car le user peut switcher de provider sans empecher de finaliser
  // une signature deja en cours sur l'ancien).
  async getProviderByName(name: string): Promise<SignatureProviderApi | null> {
    const upper = name.toUpperCase();
    const original = await this.settings.get('signature.provider');
    // Re-utilise getActiveProvider en truquant temporairement le setting via
    // une lecture directe des cles du provider demande.
    if (upper === 'DOCUSEAL') {
      const apiUrl = await this.settings.get('signature.docuseal.apiUrl');
      const apiKey = await this.settings.get('signature.docuseal.apiKey');
      const webhookSecret = await this.settings.get('signature.docuseal.webhookSecret');
      if (!apiUrl || !apiKey) return null;
      return new DocuSealProvider({ apiUrl, apiKey, webhookSecret: webhookSecret ?? undefined });
    }
    if (upper === 'YOUSIGN') {
      const apiUrl = await this.settings.get('signature.yousign.apiUrl');
      const apiKey = await this.settings.get('signature.yousign.apiKey');
      const webhookSecret = await this.settings.get('signature.yousign.webhookSecret');
      if (!apiUrl || !apiKey) return null;
      return new YousignProvider({ apiUrl, apiKey, webhookSecret: webhookSecret ?? undefined });
    }
    if (original) this.logger.debug('Provider configure : ' + original);
    return null;
  }

  // ============================================================
  // Construction du PDF a signer pour une entite donnee
  // ============================================================
  private async buildPdfForEntity(entityType: SignableEntityType, entityId: string): Promise<{ buffer: Buffer; documentName: string; companyId: string; defaultSigner: { name: string; email: string; phone?: string } | null }> {
    if (entityType === 'Quote') {
      const q = await this.prisma.quote.findUnique({
        where: { id: entityId },
        include: { company: true, contact: true, lines: { orderBy: { position: 'asc' } } },
      });
      if (!q) throw new NotFoundException('Quote introuvable');
      const buf = await this.pdf.quote({
        quote: {
          reference: q.reference,
          title: q.title,
          issueDate: q.issueDate,
          validUntil: q.validUntil,
          vatRate: Number(q.vatRate),
          notes: q.notes,
          terms: q.terms,
          subtotalHt: Number(q.subtotalHt),
          vatAmount: Number(q.vatAmount),
          totalTtc: Number(q.totalTtc),
          lines: q.lines.map((l) => ({
            description: l.description,
            quantity: Number(l.quantity),
            unitPriceHt: Number(l.unitPriceHt),
            discountPct: Number(l.discountPct),
            lineTotalHt: Number(l.lineTotalHt),
          })),
        },
        client: {
          name: q.company.name,
          address: q.company.address ?? undefined,
          postalCode: q.company.postalCode ?? undefined,
          city: q.company.city ?? undefined,
          siret: q.company.siret ?? undefined,
        },
      });
      const defaultSigner =
        q.contact?.email
          ? {
              name: (q.contact.firstName + ' ' + q.contact.lastName).trim(),
              email: q.contact.email,
              phone: q.contact.mobile ?? q.contact.phone ?? undefined,
            }
          : q.company.email
            ? { name: q.company.name, email: q.company.email }
            : null;
      return {
        buffer: buf,
        documentName: q.reference + '.pdf',
        companyId: q.companyId,
        defaultSigner,
      };
    }
    // Contract
    const c = await this.prisma.contract.findUnique({
      where: { id: entityId },
      include: { company: true },
    });
    if (!c) throw new NotFoundException('Contract introuvable');
    const buf = await this.pdf.contract({
      contract: {
        reference: c.reference,
        title: c.title,
        offer: c.offer,
        startDate: c.startDate,
        endDate: c.endDate,
        engagementMonths: c.engagementMonths,
        unitPriceHt: Number(c.unitPriceHt),
        quantity: c.quantity,
        monthlyAmountHt: Number(c.monthlyAmountHt),
        vatRate: Number(c.vatRate),
        description: c.description,
      },
      client: {
        name: c.company.name,
        address: c.company.address ?? undefined,
        postalCode: c.company.postalCode ?? undefined,
        city: c.company.city ?? undefined,
        siret: c.company.siret ?? undefined,
      },
    });
    const defaultSigner = c.company.email
      ? { name: c.company.name, email: c.company.email }
      : null;
    return {
      buffer: buf,
      documentName: c.reference + '.pdf',
      companyId: c.companyId,
      defaultSigner,
    };
  }

  // ============================================================
  // Lancement d'une signature
  // ============================================================
  async create(
    input: {
      entityType: SignableEntityType;
      entityId: string;
      signerName?: string;
      signerEmail?: string;
      signerPhone?: string;
      message?: string;
    },
    userId: string,
  ) {
    const provider = await this.getActiveProvider();
    if (!provider) {
      throw new BadRequestException('Signature electronique non configuree (Settings > Signature)');
    }

    const { buffer, documentName, companyId, defaultSigner } = await this.buildPdfForEntity(
      input.entityType,
      input.entityId,
    );

    const signerName = input.signerName ?? defaultSigner?.name;
    const signerEmail = input.signerEmail ?? defaultSigner?.email;
    if (!signerName || !signerEmail) {
      throw new BadRequestException(
        'Signataire requis (name + email). Aucun contact/email societe n\'a pu etre devine.',
      );
    }
    const signerPhone = input.signerPhone ?? defaultSigner?.phone;

    const created = await provider.createSubmission({
      documentName,
      documentBuffer: buffer,
      signerName,
      signerEmail,
      signerPhone,
      message: input.message,
    });

    const sig = await this.prisma.signatureRequest.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        provider: provider.name as SignatureProvider,
        providerSubmissionId: created.submissionId,
        providerSignerUrl: created.signerUrl,
        signerName,
        signerEmail,
        signerPhone,
        companyId,
        createdById: userId,
      },
    });

    await this.prisma.activity.create({
      data: {
        userId,
        action: 'SIGN_REQUEST',
        entity: input.entityType,
        entityId: input.entityId,
        metadata: { signatureId: sig.id, provider: provider.name, signerEmail },
      },
    });

    return sig;
  }

  // ============================================================
  // CRUD lecture
  // ============================================================
  async findAll(params: { entityType?: SignableEntityType; entityId?: string; status?: SignatureStatus; companyId?: string }) {
    const where: Prisma.SignatureRequestWhereInput = {};
    if (params.entityType) where.entityType = params.entityType;
    if (params.entityId) where.entityId = params.entityId;
    if (params.status) where.status = params.status;
    if (params.companyId) where.companyId = params.companyId;
    return this.prisma.signatureRequest.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string) {
    const s = await this.prisma.signatureRequest.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!s) throw new NotFoundException('Demande de signature introuvable');
    return s;
  }

  async cancel(id: string, userId: string) {
    const s = await this.findOne(id);
    if (s.status === 'SIGNED') throw new BadRequestException('Document deja signe — annulation impossible');
    if (s.status === 'CANCELLED') return s;
    const provider = await this.getProviderByName(s.provider);
    if (provider && s.providerSubmissionId) {
      try {
        await provider.cancelSubmission(s.providerSubmissionId);
      } catch (err: any) {
        this.logger.warn('Echec cancel cote provider : ' + err.message);
      }
    }
    const updated = await this.prisma.signatureRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await this.prisma.activity.create({
      data: { userId, action: 'SIGN_CANCEL', entity: 'SignatureRequest', entityId: id },
    });
    return updated;
  }

  // ============================================================
  // Webhook : reception evenements provider
  // ============================================================
  async handleWebhook(providerName: string, rawBody: Buffer, signatureHeader: string | undefined) {
    const provider = await this.getProviderByName(providerName);
    if (!provider) {
      this.logger.warn('Webhook recu pour provider inconnu : ' + providerName);
      return { ok: false };
    }
    const valid = await provider.verifyWebhookSignature(rawBody, signatureHeader);
    if (!valid) {
      this.logger.warn('Webhook ' + providerName + ' : signature HMAC invalide');
      throw new BadRequestException('Signature webhook invalide');
    }
    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString('utf-8'));
    } catch {
      throw new BadRequestException('Payload non JSON');
    }
    const event = provider.parseWebhookEvent(payload);
    if (!event) {
      this.logger.debug('Webhook ' + providerName + ' : event non gere ' + JSON.stringify(payload).slice(0, 200));
      return { ok: true, ignored: true };
    }
    return this.applyEvent(event, payload);
  }

  private async applyEvent(event: NormalizedWebhookEvent, rawPayload: any) {
    const sig = await this.prisma.signatureRequest.findUnique({
      where: { providerSubmissionId: event.submissionId },
    });
    if (!sig) {
      this.logger.warn('Webhook : SignatureRequest inconnue pour submissionId ' + event.submissionId);
      return { ok: false, reason: 'unknown_submission' };
    }

    const data: Prisma.SignatureRequestUpdateInput = {
      webhookEvents: {
        push: {
          kind: event.kind,
          at: event.occurredAt.toISOString(),
          payload: rawPayload,
        } as any,
      },
    };
    if (event.kind === 'viewed' && !sig.viewedAt) {
      data.status = 'VIEWED';
      data.viewedAt = event.occurredAt;
    } else if (event.kind === 'signed') {
      data.status = 'SIGNED';
      data.signedAt = event.occurredAt;
    } else if (event.kind === 'declined') {
      data.status = 'DECLINED';
      data.declinedAt = event.occurredAt;
      data.declineReason = event.declineReason;
    } else if (event.kind === 'expired') {
      data.status = 'EXPIRED';
    }

    const updated = await this.prisma.signatureRequest.update({
      where: { id: sig.id },
      data,
    });

    // Retropropagation sur l'entite cible
    if (event.kind === 'signed') {
      await this.propagateSignatureToEntity(sig.entityType as SignableEntityType, sig.entityId);
      // Tente de telecharger le document signe et stocker l'URL
      try {
        const provider = await this.getProviderByName(sig.provider);
        if (provider && sig.providerSubmissionId) {
          const doc = await provider.fetchSignedDocument(sig.providerSubmissionId);
          if (doc.url) {
            await this.prisma.signatureRequest.update({
              where: { id: sig.id },
              data: { signedDocumentUrl: doc.url },
            });
          }
        }
      } catch (err: any) {
        this.logger.warn('Fetch signed document failed : ' + err.message);
      }
    }

    return { ok: true, signatureRequestId: updated.id, status: updated.status };
  }

  private async propagateSignatureToEntity(entityType: SignableEntityType, entityId: string) {
    if (entityType === 'Quote') {
      const q = await this.prisma.quote.findUnique({ where: { id: entityId }, select: { status: true } });
      if (!q) return;
      // Quote SENT -> ACCEPTED via signature client
      if (q.status === 'SENT') {
        await this.prisma.quote.update({
          where: { id: entityId },
          data: { status: 'ACCEPTED', acceptedAt: new Date() },
        });
      }
    } else if (entityType === 'Contract') {
      const c = await this.prisma.contract.findUnique({ where: { id: entityId }, select: { signedAt: true, status: true } });
      if (!c) return;
      const data: Prisma.ContractUpdateInput = {};
      if (!c.signedAt) data.signedAt = new Date();
      if (c.status === 'DRAFT') data.status = 'ACTIVE';
      if (Object.keys(data).length > 0) {
        await this.prisma.contract.update({ where: { id: entityId }, data });
      }
    }
  }
}
