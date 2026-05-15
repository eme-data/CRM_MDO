// Seed initial des sous-traitants typiques d'un MSP francais.
// Charge au premier demarrage si la table est vide.

import { DataTransferMechanism, SubprocessorRole } from '@prisma/client';

export interface SubprocessorSeed {
  name: string;
  legalEntity?: string;
  role: SubprocessorRole;
  purpose: string;
  dataCategories: string[];
  hostingCountry: string;
  headquarters?: string;
  transfersOutsideEu: boolean;
  transferMechanism: DataTransferMechanism;
  vendorSubprocessorListUrl?: string;
}

export const SUBPROCESSOR_SEEDS: SubprocessorSeed[] = [
  {
    name: 'Microsoft 365 / Azure',
    legalEntity: 'Microsoft Ireland Operations Limited',
    role: 'EMAIL',
    purpose: 'Hebergement messagerie, OneDrive, SharePoint et Teams des clients qui ont souscrit a M365 via MDO.',
    dataCategories: ['PII', 'EMAIL_CONTENT', 'DOCUMENTS', 'AUTH'],
    hostingCountry: 'France (Datacenter EU)',
    headquarters: 'Redmond, USA',
    transfersOutsideEu: true,
    transferMechanism: 'SCC',
    vendorSubprocessorListUrl: 'https://www.microsoft.com/licensing/docs/customeragreement',
  },
  {
    name: 'Bitdefender GravityZone',
    legalEntity: 'Bitdefender SRL',
    role: 'EDR',
    purpose: 'Endpoint protection / EDR sur les postes des clients sous offre MDO Pro et Souverain.',
    dataCategories: ['TELEMETRY', 'AUTH', 'SECURITY_LOGS'],
    hostingCountry: 'Roumanie / UE',
    headquarters: 'Bucarest, Roumanie',
    transfersOutsideEu: false,
    transferMechanism: 'NOT_APPLICABLE',
  },
  {
    name: 'Veeam Backup',
    legalEntity: 'Veeam Software Group',
    role: 'BACKUP',
    purpose: 'Sauvegarde des VMs et de M365 selon le contrat client.',
    dataCategories: ['DOCUMENTS', 'EMAIL_CONTENT', 'FINANCIAL', 'PII'],
    hostingCountry: 'Selon plan : France ou Suisse',
    headquarters: 'Suisse',
    transfersOutsideEu: false,
    transferMechanism: 'ADEQUACY_DECISION',
  },
  {
    name: 'Anthropic (Claude)',
    legalEntity: 'Anthropic, PBC',
    role: 'AI',
    purpose: 'Triage automatique de tickets, draft de reponses, resume de comptes-rendus client.',
    dataCategories: ['EMAIL_CONTENT', 'PII'],
    hostingCountry: 'USA',
    headquarters: 'San Francisco, USA',
    transfersOutsideEu: true,
    transferMechanism: 'SCC',
    vendorSubprocessorListUrl: 'https://www.anthropic.com/legal/dpa',
  },
  {
    name: 'OpenAI (Whisper)',
    legalEntity: 'OpenAI Ireland Ltd',
    role: 'AI',
    purpose: 'Transcription audio des appels telephoniques (si activee).',
    dataCategories: ['CALL_RECORDINGS', 'PII'],
    hostingCountry: 'USA',
    headquarters: 'San Francisco, USA',
    transfersOutsideEu: true,
    transferMechanism: 'SCC',
  },
  {
    name: 'Free PRO (Coms Pro)',
    legalEntity: 'Free Pro SAS',
    role: 'COMMUNICATION',
    purpose: 'Telephonie professionnelle MDO + journalisation des appels clients.',
    dataCategories: ['CALL_METADATA', 'CALL_RECORDINGS'],
    hostingCountry: 'France',
    headquarters: 'Paris, France',
    transfersOutsideEu: false,
    transferMechanism: 'NOT_APPLICABLE',
  },
  {
    name: 'Jotelulu',
    legalEntity: 'Jotelulu SAS',
    role: 'HOSTING',
    purpose: 'Hebergement souverain du CRM MDO et infrastructures clients sous offre Souverain.',
    dataCategories: ['PII', 'DOCUMENTS', 'EMAIL_CONTENT', 'FINANCIAL', 'AUTH'],
    hostingCountry: 'France',
    headquarters: 'Espagne',
    transfersOutsideEu: false,
    transferMechanism: 'NOT_APPLICABLE',
  },
  {
    name: 'Qonto',
    legalEntity: 'Olinda SAS (Qonto)',
    role: 'PAYMENT',
    purpose: 'Compte pro MDO + emission factures aux clients via PDP Qonto Factures.',
    dataCategories: ['FINANCIAL', 'PII'],
    hostingCountry: 'France',
    headquarters: 'Paris, France',
    transfersOutsideEu: false,
    transferMechanism: 'NOT_APPLICABLE',
  },
];
