// Interface commune aux providers de signature electronique.
// Permet de switcher DocuSeal <-> Yousign sans toucher au reste du code.

export interface CreateSubmissionParams {
  documentName: string;       // nom logique (ex. "Devis DEV-2026-0042.pdf")
  documentBuffer: Buffer;     // contenu PDF a signer
  signerName: string;
  signerEmail: string;
  signerPhone?: string;       // pour OTP SMS si supporte
  // URL absolue ou Webhook public ou ce CRM, pour notifications evenements.
  // Le module signature s'expose sur /api/signature/webhook/{provider}.
  webhookUrl?: string;
  // Message email envoye au signataire par le provider.
  message?: string;
}

export interface CreateSubmissionResult {
  // Identifiant externe du provider — stocke dans SignatureRequest.providerSubmissionId.
  submissionId: string;
  // URL ouvrable par le signataire (si le provider en retourne une).
  signerUrl?: string;
}

export interface FetchSignedDocumentResult {
  buffer: Buffer;
  // URL CDN si le provider en fournit une (pour le stocker au lieu de re-fetch).
  url?: string;
}

export interface SignatureProviderApi {
  readonly name: string;
  createSubmission(params: CreateSubmissionParams): Promise<CreateSubmissionResult>;
  cancelSubmission(submissionId: string): Promise<void>;
  // Telecharge le document signe finalise (apres webhook 'completed').
  fetchSignedDocument(submissionId: string): Promise<FetchSignedDocumentResult>;
  // Verifie la signature HMAC d'un webhook entrant. Retourne true si valide.
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): Promise<boolean>;
  // Mappe un payload webhook brut vers un evenement normalise consommable.
  parseWebhookEvent(payload: any): NormalizedWebhookEvent | null;
}

export type WebhookEventKind = 'viewed' | 'signed' | 'declined' | 'expired';

export interface NormalizedWebhookEvent {
  kind: WebhookEventKind;
  submissionId: string;
  occurredAt: Date;
  declineReason?: string;
}
