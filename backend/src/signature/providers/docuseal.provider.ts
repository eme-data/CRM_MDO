import { BadRequestException, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  CreateSubmissionParams,
  CreateSubmissionResult,
  FetchSignedDocumentResult,
  NormalizedWebhookEvent,
  SignatureProviderApi,
} from './signature-provider.interface';

// DocuSeal API : https://www.docuseal.com/docs/api
// On utilise l'endpoint POST /submissions avec un seul "document" en base64
// (sans template). DocuSeal genere automatiquement un champ signature en bas
// de la derniere page si aucun champ explicite n'est defini.

interface DocuSealConfig {
  apiUrl: string;
  apiKey: string;
  webhookSecret?: string;
}

export class DocuSealProvider implements SignatureProviderApi {
  readonly name = 'DOCUSEAL';
  private readonly logger = new Logger(DocuSealProvider.name);

  constructor(private readonly cfg: DocuSealConfig) {}

  private get baseUrl(): string {
    return this.cfg.apiUrl.replace(/\/$/, '');
  }

  private headers(): Record<string, string> {
    return {
      'X-Auth-Token': this.cfg.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async createSubmission(p: CreateSubmissionParams): Promise<CreateSubmissionResult> {
    // DocuSeal accepte un PDF en base64 dans documents[].file. On declare un
    // signataire unique (role "Signer") avec un champ signature auto-place.
    const body = {
      send_email: true,
      message: p.message ?? undefined,
      submitters: [
        {
          email: p.signerEmail,
          name: p.signerName,
          phone: p.signerPhone,
          role: 'Signer',
        },
      ],
      documents: [
        {
          name: p.documentName,
          file: p.documentBuffer.toString('base64'),
        },
      ],
    };

    const res = await fetch(this.baseUrl + '/submissions', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      this.logger.warn('DocuSeal create submission HTTP ' + res.status + ' : ' + txt);
      throw new BadRequestException('DocuSeal a refuse la requete (' + res.status + ')');
    }
    // L'API renvoie un tableau de submitters (chacun a sa propre URL signataire).
    const json: any = await res.json();
    // Submission "id" est sur le 1er submitter (DocuSeal expose submission_id).
    const first = Array.isArray(json) ? json[0] : json.submitters?.[0] ?? json;
    const submissionId = String(first.submission_id ?? first.submission?.id ?? first.id);
    const signerUrl: string | undefined = first.embed_src ?? first.url ?? undefined;
    return { submissionId, signerUrl };
  }

  async cancelSubmission(submissionId: string): Promise<void> {
    // DocuSeal : DELETE /submissions/:id
    const res = await fetch(this.baseUrl + '/submissions/' + encodeURIComponent(submissionId), {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok && res.status !== 404) {
      this.logger.warn('DocuSeal cancel HTTP ' + res.status);
    }
  }

  async fetchSignedDocument(submissionId: string): Promise<FetchSignedDocumentResult> {
    const res = await fetch(
      this.baseUrl + '/submissions/' + encodeURIComponent(submissionId) + '/documents',
      { headers: { 'X-Auth-Token': this.cfg.apiKey } },
    );
    if (!res.ok) {
      throw new BadRequestException('DocuSeal documents HTTP ' + res.status);
    }
    const json: any = await res.json();
    const url: string | undefined = json.documents?.[0]?.url ?? json[0]?.url;
    if (!url) throw new BadRequestException('DocuSeal n\'a pas retourne d\'URL document signe');
    const docRes = await fetch(url);
    const buf = Buffer.from(await docRes.arrayBuffer());
    return { buffer: buf, url };
  }

  async verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): Promise<boolean> {
    if (!this.cfg.webhookSecret) {
      // Si pas de secret configure, on accepte (deconseille en production).
      return true;
    }
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
    // DocuSeal events : 'submission.created', 'submission.viewed',
    // 'submission.completed', 'submission.declined', 'submission.expired'.
    const event: string | undefined = payload?.event_type ?? payload?.event;
    const submissionId: string | undefined =
      payload?.data?.submission_id?.toString() ??
      payload?.data?.id?.toString() ??
      payload?.submission?.id?.toString();
    if (!event || !submissionId) return null;
    const occurredAt = payload?.timestamp ? new Date(payload.timestamp) : new Date();
    let kind: NormalizedWebhookEvent['kind'] | null = null;
    if (event.endsWith('viewed')) kind = 'viewed';
    else if (event.endsWith('completed')) kind = 'signed';
    else if (event.endsWith('declined')) kind = 'declined';
    else if (event.endsWith('expired')) kind = 'expired';
    if (!kind) return null;
    return {
      kind,
      submissionId,
      occurredAt,
      declineReason: payload?.data?.decline_reason ?? payload?.reason ?? undefined,
    };
  }
}
