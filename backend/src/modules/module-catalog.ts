// ============================================================================
// CATALOGUE DES MODULES / OFFRES (source de verite unique cote backend).
//
// Un "feature" = une fonctionnalite activable par tenant (granularite fine).
// Les features sont regroupees par "group" (= grande section de l'app) pour
// l'affichage. Les "offers" sont des bundles nommes qui pre-cochent un
// ensemble de features (confort commercial).
//
// Convention d'entitlement (cf ModuleGuard + /auth/me) :
//   - tenant.enabledModules VIDE  => acces COMPLET (tout, y compris features
//     futures). C'est le cas du tenant MDO interne -> jamais bride.
//   - tenant.enabledModules NON VIDE => acces EXACTEMENT aux codes listes.
//   - super-admin => toujours acces complet.
//
// `api` = prefixes de route (sans /api) que ce feature protege. Le ModuleGuard
// mappe le chemin de la requete vers un feature par prefixe le plus long.
// Un chemin qui ne matche AUCUN feature est transverse (auth, settings,
// notifications, admin...) et reste toujours autorise (fail-open).
// ============================================================================

export interface FeatureDef {
  code: string;
  label: string;
  group: string;
  api: string[];
}
export interface GroupDef { code: string; label: string }
export interface OfferDef { code: string; label: string; description: string; features: string[] }

export const GROUPS: GroupDef[] = [
  { code: 'pilotage', label: 'Pilotage' },
  { code: 'commercial', label: 'Commercial' },
  { code: 'support', label: 'Service & Support' },
  { code: 'infogerance', label: 'Infogerance' },
  { code: 'outils', label: 'Outils' },
  { code: 'sirh', label: 'SIRH' },
];

export const FEATURES: FeatureDef[] = [
  // ----- Pilotage -----
  { code: 'pilotage.dashboard', label: 'Tableau de bord', group: 'pilotage', api: ['dashboard'] },
  { code: 'pilotage.health', label: 'Sante clients & QBR', group: 'pilotage', api: ['health-score', 'customer-success'] },
  { code: 'pilotage.reporting', label: 'Reporting & exec', group: 'pilotage', api: ['reports', 'client-reports', 'executive', 'profitability'] },

  // ----- Commercial -----
  { code: 'commercial.crm', label: 'Societes & contacts', group: 'commercial', api: ['companies', 'contacts'] },
  { code: 'commercial.opportunities', label: 'Opportunites & leads', group: 'commercial', api: ['opportunities', 'leads'] },
  { code: 'commercial.quotes', label: 'Devis', group: 'commercial', api: ['quotes', 'quote-templates'] },
  { code: 'commercial.contracts', label: 'Contrats', group: 'commercial', api: ['contracts'] },
  { code: 'commercial.invoices', label: 'Factures & facturation', group: 'commercial', api: ['invoices', 'billing'] },

  // ----- Service & Support -----
  { code: 'support.tickets', label: 'Support (tickets)', group: 'support', api: ['tickets'] },
  { code: 'support.interventions', label: 'Interventions', group: 'support', api: ['interventions'] },
  { code: 'support.calls', label: 'Appels', group: 'support', api: ['calls'] },

  // ----- Infogerance -----
  { code: 'infra.assets', label: 'Assets & inventaire', group: 'infogerance', api: ['assets', 'flexible-assets', 'asset-lifecycle', 'locations', 'networks'] },
  { code: 'infra.patch', label: 'Patch management', group: 'infogerance', api: ['patch-management'] },
  { code: 'infra.backup', label: 'Backup verification', group: 'infogerance', api: ['backups', 'backup'] },
  { code: 'infra.monitoring', label: 'Surveillance & uptime', group: 'infogerance', api: ['surveillance', 'uptime', 'monitoring'] },
  { code: 'infra.security', label: 'Securite (SOC, phishing, email)', group: 'infogerance', api: ['soc', 'phishing', 'email-security', 'cyber-score'] },

  // ----- Outils -----
  { code: 'outils.tasks', label: 'Taches', group: 'outils', api: ['tasks', 'recurring-tasks'] },
  { code: 'outils.kb', label: 'Base de connaissances', group: 'outils', api: ['kb'] },
  { code: 'outils.templates', label: 'Templates de reponse', group: 'outils', api: ['response-templates'] },

  // ----- SIRH -----
  { code: 'sirh.dashboard', label: 'Tableau de bord RH', group: 'sirh', api: ['hr-dashboard'] },
  { code: 'sirh.leaves', label: 'Conges & absences', group: 'sirh', api: ['leaves'] },
  { code: 'sirh.planning', label: 'Planning equipe', group: 'sirh', api: ['planning'] },
  { code: 'sirh.timesheets', label: 'Feuilles de temps', group: 'sirh', api: ['timesheets'] },
  { code: 'sirh.expenses', label: 'Notes de frais', group: 'sirh', api: ['expenses'] },
  { code: 'sirh.reviews', label: 'Entretiens & objectifs', group: 'sirh', api: ['reviews', 'objectives'] },
  { code: 'sirh.journeys', label: 'Arrivees / departs', group: 'sirh', api: ['journeys'] },
  { code: 'sirh.employees', label: 'Dossier RH', group: 'sirh', api: ['employees'] },
];

export const ALL_FEATURE_CODES: string[] = FEATURES.map((f) => f.code);

function featuresOfGroups(...groups: string[]): string[] {
  return FEATURES.filter((f) => groups.includes(f.group)).map((f) => f.code);
}

export const OFFERS: OfferDef[] = [
  {
    code: 'essentiel', label: 'Essentiel CRM',
    description: 'Le coeur commercial : societes, contacts, opportunites, tableau de bord, taches.',
    features: ['pilotage.dashboard', 'commercial.crm', 'commercial.opportunities', 'outils.tasks'],
  },
  {
    code: 'commercial', label: 'Commercial+',
    description: 'Toute la chaine de vente (devis, contrats, factures) + pilotage.',
    features: [...featuresOfGroups('commercial', 'pilotage'), 'outils.tasks', 'outils.kb'],
  },
  {
    code: 'msp', label: 'MSP complet',
    description: 'Offre infogerance complete : commercial, support, infogerance, outils, pilotage.',
    features: featuresOfGroups('pilotage', 'commercial', 'support', 'infogerance', 'outils'),
  },
  {
    code: 'rh', label: 'RH (SIRH)',
    description: 'La brique RH seule (conges, frais, temps, entretiens, parcours...) + tableau de bord.',
    features: [...featuresOfGroups('sirh'), 'pilotage.dashboard'],
  },
  {
    code: 'full', label: 'Suite complete',
    description: 'Tous les modules.',
    features: ALL_FEATURE_CODES,
  },
];

// Resout les features effectives d'un tenant :
//   - liste vide => acces complet (tout le catalogue).
//   - sinon => exactement les codes listes (filtres sur le catalogue connu).
export function resolveFeatures(enabledModules: string[] | null | undefined): string[] {
  if (!enabledModules || enabledModules.length === 0) return [...ALL_FEATURE_CODES];
  const known = new Set(ALL_FEATURE_CODES);
  return enabledModules.filter((c) => known.has(c));
}

// Mappe un chemin de requete (ex: "/api/leaves/mine" ou "leaves/mine") vers le
// code de feature qui le protege, par prefixe le plus long. Renvoie null si
// aucun feature ne couvre ce chemin (route transverse -> toujours autorisee).
export function featureForPath(rawPath: string): string | null {
  let p = rawPath.split('?')[0].replace(/^\/+/, '');
  if (p.startsWith('api/')) p = p.slice(4);
  const seg = p.split('/').filter(Boolean);
  // Versioning URI (defaultVersion ['1', NEUTRAL]) : ignore un segment de
  // version eventuel en tete (ex: /api/v1/leaves).
  if (seg.length && /^v\d+$/.test(seg[0])) seg.shift();
  if (seg.length === 0) return null;
  let best: { code: string; len: number } | null = null;
  for (const f of FEATURES) {
    for (const prefix of f.api) {
      const pseg = prefix.split('/').filter(Boolean);
      if (pseg.length > seg.length) continue;
      const matches = pseg.every((s, i) => s === seg[i]);
      if (matches && (!best || pseg.length > best.len)) best = { code: f.code, len: pseg.length };
    }
  }
  return best ? best.code : null;
}
