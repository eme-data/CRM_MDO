// Gating des modules cote front. `me().modules` contient les codes de features
// effectifs du tenant (resolus backend : vide/super-admin => tout le catalogue).
// On masque les entrees de menu et on garde les pages des modules non inclus.
//
// La table ci-dessous mappe un prefixe de chemin -> code de feature. Doit
// rester alignee avec backend/src/modules/module-catalog.ts (memes codes).

export const FEATURE_BY_PATH: { prefix: string; feature: string }[] = [
  // Pilotage
  { prefix: '/dashboard', feature: 'pilotage.dashboard' },
  { prefix: '/health-overview', feature: 'pilotage.health' },
  { prefix: '/customer-success', feature: 'pilotage.health' },
  { prefix: '/reports', feature: 'pilotage.reporting' },
  // Commercial
  { prefix: '/companies', feature: 'commercial.crm' },
  { prefix: '/contacts', feature: 'commercial.crm' },
  { prefix: '/opportunities', feature: 'commercial.opportunities' },
  { prefix: '/quotes', feature: 'commercial.quotes' },
  { prefix: '/contracts', feature: 'commercial.contracts' },
  { prefix: '/invoices', feature: 'commercial.invoices' },
  // Service & Support
  { prefix: '/tickets', feature: 'support.tickets' },
  { prefix: '/interventions', feature: 'support.interventions' },
  { prefix: '/field', feature: 'support.interventions' },
  { prefix: '/calls', feature: 'support.calls' },
  // Infogerance
  { prefix: '/assets', feature: 'infra.assets' },
  { prefix: '/asset-lifecycle', feature: 'infra.assets' },
  { prefix: '/patch-management', feature: 'infra.patch' },
  { prefix: '/backups', feature: 'infra.backup' },
  { prefix: '/surveillance', feature: 'infra.monitoring' },
  { prefix: '/uptime', feature: 'infra.monitoring' },
  { prefix: '/audit-dns', feature: 'infra.security' },
  { prefix: '/email-security', feature: 'infra.security' },
  { prefix: '/soc', feature: 'infra.security' },
  { prefix: '/phishing', feature: 'infra.security' },
  // Outils
  { prefix: '/tasks', feature: 'outils.tasks' },
  { prefix: '/templates', feature: 'outils.templates' },
  { prefix: '/kb', feature: 'outils.kb' },
  // Stock (l'ordre importe peu : featureForPath prend le prefixe le plus long)
  { prefix: '/stock/commandes', feature: 'stock.purchasing' },
  { prefix: '/stock', feature: 'stock.inventory' },
  // SIRH
  { prefix: '/sirh', feature: 'sirh.dashboard' },
  { prefix: '/conges', feature: 'sirh.leaves' },
  { prefix: '/planning', feature: 'sirh.planning' },
  { prefix: '/feuilles', feature: 'sirh.timesheets' },
  { prefix: '/frais', feature: 'sirh.expenses' },
  { prefix: '/entretiens', feature: 'sirh.reviews' },
  { prefix: '/parcours', feature: 'sirh.journeys' },
  { prefix: '/rh', feature: 'sirh.employees' },
];

// Feature couvrant un chemin (prefixe le plus long), ou null si transverse
// (admin, super-admin, settings, aide, time... -> toujours accessible).
export function featureForPath(pathname: string): string | null {
  let best: { feature: string; len: number } | null = null;
  for (const { prefix, feature } of FEATURE_BY_PATH) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      if (!best || prefix.length > best.len) best = { feature, len: prefix.length };
    }
  }
  return best ? best.feature : null;
}

// Un module/feature est-il accessible ? modules undefined => acces complet
// (defaut sur : on ne masque rien tant qu'on ne sait pas).
export function hasFeature(modules: string[] | undefined | null, feature: string | null): boolean {
  if (!feature) return true;
  if (!modules) return true;
  return modules.includes(feature);
}

// Page d'accueil de repli selon les droits (quand la page demandee est interdite
// ou apres login). On prend la 1re entree du menu dont le feature est accessible.
export function homePathFor(modules: string[] | undefined | null): string {
  if (!modules || modules.length === 0) return '/dashboard';
  if (modules.includes('pilotage.dashboard')) return '/dashboard';
  for (const { prefix, feature } of FEATURE_BY_PATH) {
    if (modules.includes(feature)) return prefix;
  }
  return '/settings';
}
