import { BadRequestException, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  CreateSubmissionParams,
  CreateSubmissionResult,
  FetchSignedDocumentResult,
  NormalizedWebhookEvent,
  SignatureProviderApi,
} from './signature-provider.interface';

// Yousign API v3 : https://developers.yousign.com/reference/post_signature-requests
// Workflow Yousign v3 :
//   1) POST /signature_requests              -> signature_request_id
//   2) POST /signature_requests/:id/documents (multipart "file")
//   3) POST /signature_requests/:id/signers   (1 signer)
//   4) POST /signature_requests/:id/activate
//   5) Webhook 'signature_request.done' a la fin

interface YousignConfig {
  apiUrl: string;
  apiKey: string;
  webhookSecret?: string;
}

export class YousignProvider implements SignatureProviderApi {
  readonly name = 'YOUSIGN';
  private readonly logger = new Logger(YousignProvider.name);

  constructor(private readonly cfg: YousignConfig) {}

  private get baseUrl(): string {
    return this.cfg.apiUrl.replace(/\/$/, '');
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: 'Bearer ' + this.cfg.apiKey,
    };
  }

  async createSubmission(p: CreateSubmissionParams): Promise<CreateSubmissionResult> {
    // Etape 1 : creation enveloppe
    const reqRes = await fetch(this.baseUrl + '/signature_requests', {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: p.documentName,
        delivery_mode: 'email',
        timezone: 'Europe/Paris',
      }),
    });
    if (!reqRes.ok) {
      throw new BadRequestException('Yousign create signature_request HTTP ' + reqRes.status);
    }
    const reqJson: any = await reqRes.json();
    const sigReqId: string = reqJson.id;

    // Etape 2 : upload du document (multipart)
    const fd = new FormData();
    fd.append('nature', 'signable_document');
    fd.append('file', new Blob([new Uint8Array(p.documentBuffer)], { type: 'application/pdf' }), p.documentName);
    const docRes = await fetch(this.baseUrl + '/signature_requests/' + sigReqId + '/documents', {
      method: 'POST',
      headers: this.authHeaders(),
      body: fd as any,
    });
    if (!docRes.ok) {
      throw new BadRequestException('Yousign upload doc HTTP ' + docRes.status);
    }
    const docJson: any = await docRes.json();
    const docId: string = docJson.id;

    // Etape 3 : ajout signataire (signature_level = electronic_signature standard)
    const signerRes = await fetch(this.baseUrl + '/signature_requests/' + sigReqId + '/signers', {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        info: {
          first_name: p.signerName.split(' ')[0] ?? p.signerName,
          last_name: p.signerName.split(' ').slice(1).join(' ') || '-',
          email: p.signerEmail,
          phone_number: p.signerPhone,
          locale: 'fr',
        },
        signature_level: 'electronic_signature',
        signature_authentication_mode: p.signerPhone ? 'otp_sms' : 'no_otp',
        fields: [
          // Champ signature place automatiquement (Yousign place une signature
          // de base si on ne passe pas de coordonnees explicites — selon plan).
          {
            type: 'signature',
            document_id: docId,
            page: 1,
            x: 100,
            y: 100,
          },
        ],
      }),
    });
    if (!signerRes.ok) {
      const t = await signerRes.text();
      this.logger.warn('Yousign add signer HTTP ' + signerRes.status + ' : ' + t);
      throw new BadRequestException('Yousign add signer HTTP ' + signerRes.status);
    }

    // Etape 4 : activation (envoie le mail au signataire)
    const actRes = await fetch(this.baseUrl + '/signature_requests/' + sigReqId + '/activate', {
      method: 'POST',
      headers: this.authHeaders(),
    });
    if (!actRes.ok) {
      throw new BadRequestException('Yousign activate HTTP ' + actRes.status);
    }
    const actJson: any = await actRes.json();
    // signers[0].signature_link contient l'URL signataire
    const signerUrl: string | undefined = actJson.signers?.[0]?.signature_link;
    return { submissionId: sigReqId, signerUrl };
  }

  async cancelSubmission(submissionId: string): Promise<void> {
    const res = await fetch(
      this.baseUrl + '/signature_requests/' + encodeURIComponent(submissionId) + '/cancel',
      { method: 'POST', headers: this.authHeaders() },
    );
    if (!res.ok && res.status !== 404) {
      this.logger.warn('Yousign cancel HTTP ' + res.status);
    }
  }

  async fetchSignedDocument(submissionId: string): Promise<FetchSignedDocumentResult> {
    // Lister documents puis telecharger le 1er
    const listRes = await fetch(
      this.baseUrl + '/signature_requests/' + encodeURIComponent(submissionId) + '/documents',
      { headers: this.authHeaders() },
    );
    if (!listRes.ok) throw new BadRequestException('Yousign list docs HTTP ' + listRes.status);
    const docs: any[] = await listRes.json();
    const docId = docs?.[0]?.id;
    if (!docId) throw new BadRequestException('Yousign : aucun document signe trouve');
    const dlRes = await fetch(
      this.baseUrl + '/signature_requests/' + encodeURIComponent(submissionId) + '/documents/' + docId + '/download',
      { headers: this.authHeaders() },
    );
    if (!dlRes.ok) throw new BadRequestException('Yousign download HTTP ' + dlRes.status);
    const buf = Buffer.from(await dlRes.arrayBuffer());
    return { buffer: buf };
  }

  async verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): Promise<boolean> {
    if (!this.cfg.webhookSecret) return true;
    if (!signatureHeader) return false;
    const expected = createHmac('sha256', this.cfg.webhookSecret).update(rawBody).digest('hex');
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(signatureHeader.replace(/^sha256=/, ''), 'hex');
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  parseWebhookEvent(payload: any): NormalizedWebhookEvent | null {
    // Yousign events : 'signature_request.activated', 'signer.notified',
    // 'signer.signed', 'signer.declined', 'signature_request.done',
    // 'signature_request.expired'.
    const event: string | undefined = payload?.event_name ?? payload?.event;
    const submissionId: string | undefined =
      payload?.data?.signature_request?.id ?? payload?.signature_request?.id;
    if (!event || !submissionId) return null;
    const occurredAt = payload?.event_time
      ? new Date(payload.event_time)
      : payload?.timestamp
        ? new Date(payload.timestamp)
        : new Date();
    let kind: NormalizedWebhookEvent['kind'] | null = null;
    if (event === 'signature_request.done' || event === 'signer.signed') kind = 'signed';
    else if (event === 'signer.declined') kind = 'declined';
    else if (event === 'signature_request.expired') kind = 'expired';
    else if (event === 'signer.notified' || event === 'signature_request.activated') kind = 'viewed';
    if (!kind) return null;
    return {
      kind,
      submissionId,
      occurredAt,
      declineReason: payload?.data?.signer?.decline_reason ?? undefined,
    };
  }
}
