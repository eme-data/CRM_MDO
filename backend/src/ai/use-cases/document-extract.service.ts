import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentCategory } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai.service';
import { DocumentsService } from '../../documents/documents.service';
import { AnthropicContentBlock } from '../anthropic.client';

// Extraction structuree d'informations depuis un document client (KBIS, RIB,
// attestation URSSAF, contrat). Utilise Claude Vision pour les images, et le
// support PDF natif d'Anthropic (header beta) pour les PDF.
//
// Limite : Claude Vision a une limite de 5 Mo par image apres encodage base64.
// Au-dessus, on refuse plutot que de tronquer (ne pas envoyer un fichier
// inexploitable et facturer le user pour rien).
const MAX_VISION_BYTES = 5 * 1024 * 1024;

const EXTRACT_SYSTEM_PROMPT = `Tu es un assistant d'extraction documentaire pour un MSP francais.
On te fournit un document client (KBIS, RIB, attestation URSSAF, contrat...).
Ton role : extraire les informations cles dans un JSON STRICT (sans bloc
markdown, sans commentaire), suivant le schema fourni dans le user message.

Regles :
- Reponds UNIQUEMENT avec le JSON. Aucun texte avant/apres.
- Si une info est absente du document, mets null pour le champ correspondant
  (n'invente JAMAIS).
- Si le document ne correspond pas du tout au type demande (ex. on attend un
  KBIS mais c'est un RIB), retourne {"error": "wrong_document_type"}.
- Pour les nombres : pas de symbole monetaire, pas d'espaces, point comme
  separateur decimal.
- Pour les dates : format YYYY-MM-DD strict.
- Pour les SIREN : 9 chiffres sans espaces. SIRET : 14 chiffres sans espaces.`;

// Schemas par categorie : ce que Claude doit chercher selon le type de doc.
// On garde les champs alignes sur le model Company quand applicable, pour
// pouvoir proposer un update direct cote UI.
const SCHEMAS: Record<DocumentCategory | 'AUTO', { hint: string; schema: string }> = {
  KYC: {
    hint: "C'est probablement un KBIS, un RIB, un avis de situation INSEE ou une carte d'identite dirigeant.",
    schema: `{
  "documentType": "KBIS" | "RIB" | "AVIS_INSEE" | "ID_CARD" | "OTHER",
  "siren": string | null,
  "siret": string | null,
  "raisonSociale": string | null,
  "legalForm": string | null,           // "SAS", "SARL", "SCI", "EURL"...
  "capitalSocial": number | null,       // en EUR
  "apeCode": string | null,             // ex "6201Z"
  "address": string | null,             // numero + voie
  "postalCode": string | null,
  "city": string | null,
  "rcsCity": string | null,             // ville d'immatriculation RCS
  "iban": string | null,                // si RIB
  "bic": string | null,                 // si RIB
  "issueDate": string | null,           // date d'emission du document
  "validUntil": string | null           // si applicable (KBIS valide 3 mois en pratique)
}`,
  },
  COMPLIANCE: {
    hint: "C'est probablement une attestation URSSAF, une assurance RC pro, une attestation fiscale ou similaire.",
    schema: `{
  "documentType": "URSSAF" | "INSURANCE_RC" | "TAX_ATTESTATION" | "OTHER",
  "issuer": string | null,              // organisme emetteur
  "beneficiary": string | null,         // entreprise concernee
  "siren": string | null,
  "issueDate": string | null,
  "validUntil": string | null,
  "policyNumber": string | null,        // numero de contrat / police
  "amount": number | null               // montant garanti / cotise si applicable
}`,
  },
  CONTRACT_SIGNED: {
    hint: 'C\'est un contrat ou un avenant signe entre MDO et un client.',
    schema: `{
  "documentType": "CONTRACT" | "AMENDMENT" | "QUOTE_SIGNED" | "OTHER",
  "title": string | null,
  "client": string | null,
  "startDate": string | null,
  "endDate": string | null,
  "monthlyAmount": number | null,
  "engagementMonths": number | null,
  "signedAt": string | null,
  "signatories": string[] | null        // noms des signataires
}`,
  },
  LEGAL: {
    hint: 'C\'est probablement une lettre de mission, un mandat ou un NDA.',
    schema: `{
  "documentType": "MANDATE" | "NDA" | "MISSION_LETTER" | "OTHER",
  "title": string | null,
  "parties": string[] | null,
  "issueDate": string | null,
  "validUntil": string | null,
  "scope": string | null                // 1-2 phrases sur l'objet
}`,
  },
  TECHNICAL: {
    hint: 'C\'est un schema reseau, un plan serveur ou de la documentation technique.',
    schema: `{
  "documentType": "NETWORK_DIAGRAM" | "SERVER_INVENTORY" | "DOCUMENTATION" | "OTHER",
  "summary": string | null              // 2-3 phrases resumant ce que le document decrit
}`,
  },
  COMMUNICATION: {
    hint: 'C\'est un courrier, un mail archive ou similaire.',
    schema: `{
  "documentType": "LETTER" | "EMAIL" | "OTHER",
  "from": string | null,
  "to": string | null,
  "date": string | null,
  "subject": string | null,
  "summary": string | null
}`,
  },
  OTHER: {
    hint: 'On ne connait pas la nature du document. Identifie-le et extrait ce qui semble important.',
    schema: `{
  "documentType": string,               // libre, ex: "CARTE_VISITE", "BON_DE_COMMANDE"
  "summary": string | null,
  "keyFields": Record<string, string | number | null>
}`,
  },
  AUTO: {
    hint: '',
    schema: '',
  },
};

// MIME types Vision (image directe)
const VISION_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
// MIME PDF (document beta)
const PDF_MIME = 'application/pdf';

@Injectable()
export class DocumentExtractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly documents: DocumentsService,
  ) {}

  // Scope tenant : un user du tenant A pouvait declencher une extraction IA
  // (vision Claude) sur un document du tenant B en devinant l'UUID — pire
  // exfiltration via IA car les documents contiennent souvent KBIS, contrats,
  // pieces d'identite. Filtre par tenantId obligatoire.
  async extract(documentId: string, tenantId: string | null, userId: string) {
    const doc = await this.prisma.companyDocument.findFirst({
      where: { id: documentId, tenantId },
      select: {
        id: true, mimeType: true, sizeBytes: true, storageKey: true,
        category: true, filename: true, companyId: true,
      },
    });
    if (!doc) throw new NotFoundException('Document introuvable');

    // Format supporte ?
    const isImage = VISION_MIMES.has(doc.mimeType);
    const isPdf = doc.mimeType === PDF_MIME;
    if (!isImage && !isPdf) {
      throw new BadRequestException(
        'Format ' + doc.mimeType + ' non extractible. Formats supportes : JPG, PNG, WEBP, PDF.',
      );
    }
    if (doc.sizeBytes > MAX_VISION_BYTES) {
      throw new BadRequestException(
        'Fichier > 5 Mo non extractible (limite Anthropic Vision). '
        + 'Reduisez la taille du PDF ou exportez une image plus compressee.',
      );
    }

    // Lit le fichier physique en buffer puis encode base64.
    const buffer = await this.documents.readBuffer(doc.storageKey);
    const base64 = buffer.toString('base64');

    const schema = SCHEMAS[doc.category] ?? SCHEMAS.OTHER;
    const userMessage: AnthropicContentBlock[] = [
      isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
        : { type: 'image', source: { type: 'base64', media_type: doc.mimeType, data: base64 } },
      {
        type: 'text',
        text: [
          'Categorie attendue : ' + doc.category,
          schema.hint,
          '',
          'Schema JSON a respecter STRICTEMENT (cles + types) :',
          schema.schema,
          '',
          'Renvoie le JSON.',
        ].join('\n'),
      },
    ];

    const text = await this.ai.invoke({
      capability: 'DOCUMENT_EXTRACT',
      systemPrompt: EXTRACT_SYSTEM_PROMPT,
      userMessage,
      // Pas de cache : chaque document est unique, le cache du system prompt
      // suffit (5 min entre 2 extractions = scenario realiste).
      cacheSystem: true,
      maxTokens: 1500,
      temperature: 0,
      entityType: 'CompanyDocument',
      entityId: documentId,
      userId,
    });

    // Parse JSON tolerant : si Claude renvoie du markdown malgre l'instruction,
    // on extrait le 1er bloc {...}.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { raw: text, error: 'Reponse non parsable' };
    let parsed: any;
    try { parsed = JSON.parse(match[0]); }
    catch { return { raw: text, error: 'JSON invalide', text }; }

    // Si Claude a detecte un mismatch type (ex: KYC attendu mais on a un RIB),
    // on remonte tel quel sans retenter.
    if (parsed.error === 'wrong_document_type') {
      return { error: 'wrong_document_type', extracted: parsed };
    }

    // Pour les KBIS : prepare un suggestedCompanyUpdate qui cible les champs
    // existants du model Company pour permettre un apply direct cote UI.
    const suggestedCompanyUpdate: Record<string, any> = {};
    if (doc.category === 'KYC' && parsed.documentType === 'KBIS') {
      if (parsed.siren) suggestedCompanyUpdate.siren = String(parsed.siren).replace(/\s/g, '');
      if (parsed.siret) suggestedCompanyUpdate.siret = String(parsed.siret).replace(/\s/g, '');
      if (parsed.legalForm) suggestedCompanyUpdate.legalForm = parsed.legalForm;
      if (typeof parsed.capitalSocial === 'number') suggestedCompanyUpdate.capitalSocial = parsed.capitalSocial;
      if (parsed.apeCode) suggestedCompanyUpdate.apeCode = parsed.apeCode;
      if (parsed.address) suggestedCompanyUpdate.address = parsed.address;
      if (parsed.postalCode) suggestedCompanyUpdate.postalCode = parsed.postalCode;
      if (parsed.city) suggestedCompanyUpdate.city = parsed.city;
    }

    return {
      extracted: parsed,
      companyId: doc.companyId,
      suggestedCompanyUpdate: Object.keys(suggestedCompanyUpdate).length > 0
        ? suggestedCompanyUpdate
        : null,
    };
  }
}
