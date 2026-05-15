// Templates de frameworks compliance pre-charges au demarrage si absents.
// Editables ensuite via UI admin (ajout/modif controle, nouveau framework).

import { ComplianceCriticality } from '@prisma/client';

export interface SeedControl {
  code: string;
  title: string;
  description?: string;
  category?: string;
  criticality?: ComplianceCriticality;
}

export interface SeedFramework {
  code: string;
  name: string;
  description?: string;
  version?: string;
  controls: SeedControl[];
}

// NIS2 directive UE 2022/2555 article 21 : 10 mesures minimales obligatoires
// pour les entites essentielles et importantes. Source : ANSSI guide NIS2 2024.
const NIS2: SeedFramework = {
  code: 'NIS2',
  name: 'NIS2 — Mesures minimales art. 21',
  description:
    'Directive UE 2022/2555 (NIS2) — 10 mesures techniques et organisationnelles minimales transposees en droit francais en 2024.',
  version: '2024-FR',
  controls: [
    { code: 'NIS2-1', title: 'Politique d\'analyse des risques et de la securite des SI',
      description: 'Politique formalisee, validee par la direction, revue annuellement.',
      category: 'Gouvernance', criticality: 'CRITICAL' },
    { code: 'NIS2-2', title: 'Gestion des incidents',
      description: 'Procedure de detection, notification, traitement et retour d\'experience des incidents cyber.',
      category: 'Gouvernance', criticality: 'CRITICAL' },
    { code: 'NIS2-3', title: 'Continuite des activites et gestion des crises',
      description: 'PCA / PRA testes, sauvegardes regulieres, procedure de gestion de crise.',
      category: 'Continuite', criticality: 'HIGH' },
    { code: 'NIS2-4', title: 'Securite de la chaine d\'approvisionnement',
      description: 'Evaluation de la securite des fournisseurs IT/cloud critiques (clauses contractuelles, audits).',
      category: 'Tiers', criticality: 'HIGH' },
    { code: 'NIS2-5', title: 'Acquisition, developpement et maintenance des SI',
      description: 'Securite tout au long du cycle de vie, gestion des vulnerabilites, mise a jour reguliere.',
      category: 'Technique', criticality: 'HIGH' },
    { code: 'NIS2-6', title: 'Politiques d\'evaluation de l\'efficacite des mesures de gestion des risques',
      description: 'Indicateurs, tableau de bord, audits internes/externes annuels.',
      category: 'Gouvernance', criticality: 'MEDIUM' },
    { code: 'NIS2-7', title: 'Pratiques d\'hygiene cybersecurite et formation',
      description: 'Sensibilisation utilisateurs au moins annuelle, gestion des mots de passe, MFA.',
      category: 'Personnel', criticality: 'HIGH' },
    { code: 'NIS2-8', title: 'Politique d\'utilisation de la cryptographie et chiffrement',
      description: 'Chiffrement des donnees sensibles au repos et en transit. Gestion des cles.',
      category: 'Technique', criticality: 'HIGH' },
    { code: 'NIS2-9', title: 'Securite des ressources humaines, controle d\'acces et gestion des actifs',
      description: 'Onboarding/offboarding, principe du moindre privilege, inventaire des actifs informatiques.',
      category: 'Personnel', criticality: 'HIGH' },
    { code: 'NIS2-10', title: 'Authentification multifacteur ou continue, voix/video/texte chiffres',
      description: 'MFA generalisee pour tous les acces sensibles. Communications chiffrees pour les echanges critiques.',
      category: 'Technique', criticality: 'CRITICAL' },
  ],
};

// ISO 27001 Annexe A 2022 — 4 themes (sous-ensemble representatif pour le seed,
// l'utilisateur pourra ajouter les controles manquants via l'UI). 14 controles
// les plus prioritaires pour une PME/MSP.
const ISO27001: SeedFramework = {
  code: 'ISO27001',
  name: 'ISO/IEC 27001:2022 — Annexe A (sous-ensemble PME)',
  description:
    'Sous-ensemble de l\'Annexe A 2022 oriente PME et MSP. Ajoutez les autres controles via l\'UI admin selon le perimetre client.',
  version: '2022',
  controls: [
    { code: 'A.5.1', title: 'Politiques de securite de l\'information', category: 'Organisationnel', criticality: 'HIGH' },
    { code: 'A.5.7', title: 'Renseignement sur les menaces (threat intelligence)', category: 'Organisationnel', criticality: 'MEDIUM' },
    { code: 'A.5.15', title: 'Controle d\'acces', category: 'Organisationnel', criticality: 'CRITICAL' },
    { code: 'A.5.30', title: 'Preparation des TIC pour la continuite des affaires', category: 'Organisationnel', criticality: 'HIGH' },
    { code: 'A.6.3', title: 'Sensibilisation, education et formation', category: 'Personnel', criticality: 'HIGH' },
    { code: 'A.7.4', title: 'Surveillance physique', category: 'Physique', criticality: 'MEDIUM' },
    { code: 'A.8.1', title: 'Equipement utilisateur (endpoint)', category: 'Technique', criticality: 'HIGH' },
    { code: 'A.8.2', title: 'Droits d\'acces privilegies', category: 'Technique', criticality: 'CRITICAL' },
    { code: 'A.8.7', title: 'Protection contre les logiciels malveillants', category: 'Technique', criticality: 'CRITICAL' },
    { code: 'A.8.8', title: 'Gestion des vulnerabilites techniques', category: 'Technique', criticality: 'HIGH' },
    { code: 'A.8.13', title: 'Sauvegarde des informations', category: 'Technique', criticality: 'CRITICAL' },
    { code: 'A.8.16', title: 'Activites de surveillance', category: 'Technique', criticality: 'HIGH' },
    { code: 'A.8.24', title: 'Utilisation de la cryptographie', category: 'Technique', criticality: 'HIGH' },
    { code: 'A.8.28', title: 'Codage securise', category: 'Technique', criticality: 'MEDIUM' },
  ],
};

export const FRAMEWORK_SEEDS: SeedFramework[] = [NIS2, ISO27001];
