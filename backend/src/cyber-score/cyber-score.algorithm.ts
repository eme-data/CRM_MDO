// Algorithme de calcul du Cyber Risk Score — fonction PURE, testable sans
// dependance Prisma. Le service charge les inputs, cette fonction calcule.
//
// Score 0-100, plus haut = meilleure posture de securite. Six sous-scores
// ponderes ; un sous-score "non applicable" (ex. pas de M365 connecte) est
// EXCLU du calcul plutot que de tirer la note vers le bas — on note la
// realite, pas l'absence de signal.

export interface ScoreInputs {
  m365: {
    tenantConfigured: boolean;
    enabledUsers: number;
    usersWithMfa: number;
    openAlerts: { high: number; medium: number; low: number };
  };
  assets: {
    // Total hors RETIRED
    activeCount: number;
    expiredCount: number;        // expiresAt < now OR status=EXPIRED OR warrantyUntil < now
    expiringSoonCount: number;   // expiresAt entre now et now+30j
  };
  certificates: {
    monitoredCount: number;
    inError: number;             // monitoringError != null
    expired: number;             // expiresAt < now
  };
  uptime: {
    enabledMonitorsCount: number;
    upChecks30d: number;
    totalChecks30d: number;
  };
  documentation: {
    flexibleAssetsCount: number;
    docPagesCount: number;
    networksOrLocationsCount: number;
  };
}

export interface Subscore {
  // Note 0-100 ; null = sous-score non applicable (exclu de l'agregat)
  score: number | null;
  weight: number;       // pondération relative dans le score global
  label: string;        // libelle affichage
  detail: string;       // 1 phrase explicative pour l'UI
}

export interface Recommendation {
  // Priorite : 1 = haute (>20% perte score), 2 = moyenne, 3 = basse
  priority: 1 | 2 | 3;
  title: string;
  // Lien interne suggere (ex. "/companies/{id}/m365") ; null si pas d'action UI directe
  linkPath: string | null;
}

export interface ScoreResult {
  // Score global 0-100, null si aucun signal disponible
  score: number | null;
  // Bucket textuel pour UI (couleur + libelle)
  level: 'NO_DATA' | 'POOR' | 'AVERAGE' | 'GOOD' | 'EXCELLENT';
  subscores: {
    mfa: Subscore;
    alerts: Subscore;
    assetHygiene: Subscore;
    certificates: Subscore;
    uptime: Subscore;
    documentation: Subscore;
  };
  recommendations: Recommendation[];
}

// Bornes des paliers (inclusives bas, exclusives haut sauf EXCELLENT)
function levelFor(score: number | null): ScoreResult['level'] {
  if (score === null) return 'NO_DATA';
  if (score >= 85) return 'EXCELLENT';
  if (score >= 70) return 'GOOD';
  if (score >= 50) return 'AVERAGE';
  return 'POOR';
}

function pct(num: number, denom: number): number {
  if (denom <= 0) return 0;
  return Math.max(0, Math.min(100, (num / denom) * 100));
}

export function computeCyberScore(inputs: ScoreInputs): ScoreResult {
  // ---------- Sous-score 1 : couverture MFA M365 ----------
  let mfa: Subscore;
  if (!inputs.m365.tenantConfigured) {
    mfa = {
      score: null,
      weight: 25,
      label: 'MFA M365',
      detail: 'Tenant M365 non connecte au CRM',
    };
  } else if (inputs.m365.enabledUsers === 0) {
    // Tenant connecte mais aucun user importe encore (sync recente ?)
    mfa = {
      score: null,
      weight: 25,
      label: 'MFA M365',
      detail: 'Aucun utilisateur synchronise',
    };
  } else {
    const score = pct(inputs.m365.usersWithMfa, inputs.m365.enabledUsers);
    mfa = {
      score,
      weight: 25,
      label: 'MFA M365',
      detail: `${inputs.m365.usersWithMfa} / ${inputs.m365.enabledUsers} utilisateurs avec MFA`,
    };
  }

  // ---------- Sous-score 2 : alertes M365 non resolues ----------
  let alerts: Subscore;
  if (!inputs.m365.tenantConfigured) {
    alerts = {
      score: null,
      weight: 20,
      label: 'Alertes securite M365',
      detail: 'Tenant M365 non connecte',
    };
  } else {
    // Penalites : high = 15, medium = 5, low = 1 (capped a 100 perdus)
    const penalty =
      inputs.m365.openAlerts.high * 15 +
      inputs.m365.openAlerts.medium * 5 +
      inputs.m365.openAlerts.low * 1;
    const score = Math.max(0, 100 - penalty);
    const total =
      inputs.m365.openAlerts.high +
      inputs.m365.openAlerts.medium +
      inputs.m365.openAlerts.low;
    alerts = {
      score,
      weight: 20,
      label: 'Alertes securite M365',
      detail:
        total === 0
          ? 'Aucune alerte ouverte'
          : `${total} alerte${total > 1 ? 's' : ''} non resolue${total > 1 ? 's' : ''} ` +
            `(${inputs.m365.openAlerts.high} haute${inputs.m365.openAlerts.high > 1 ? 's' : ''})`,
    };
  }

  // ---------- Sous-score 3 : hygiene des assets (materiel / licences) ----------
  let assetHygiene: Subscore;
  if (inputs.assets.activeCount === 0) {
    // Pas d'inventaire : on note 60 (neutre-bas) pour inciter a documenter,
    // sans pour autant tirer le score global vers le bas de maniere trompeuse
    // pour les clients qui ne nous ont pas confie leur parc.
    assetHygiene = {
      score: 60,
      weight: 20,
      label: 'Hygiene materiel / licences',
      detail: 'Aucun asset documente — inventaire incomplet',
    };
  } else {
    const healthy =
      inputs.assets.activeCount -
      inputs.assets.expiredCount -
      inputs.assets.expiringSoonCount;
    // expiring soon compte pour 0.5 (penalite moindre que franchement expire)
    const adjusted = healthy + inputs.assets.expiringSoonCount * 0.5;
    const score = pct(adjusted, inputs.assets.activeCount);
    assetHygiene = {
      score,
      weight: 20,
      label: 'Hygiene materiel / licences',
      detail:
        `${inputs.assets.activeCount} asset${inputs.assets.activeCount > 1 ? 's' : ''}` +
        (inputs.assets.expiredCount > 0
          ? ` · ${inputs.assets.expiredCount} expire${inputs.assets.expiredCount > 1 ? 's' : ''}`
          : '') +
        (inputs.assets.expiringSoonCount > 0
          ? ` · ${inputs.assets.expiringSoonCount} expire${inputs.assets.expiringSoonCount > 1 ? 'nt' : ''} <30j`
          : ''),
    };
  }

  // ---------- Sous-score 4 : certificats / domaines surveilles ----------
  let certificates: Subscore;
  if (inputs.certificates.monitoredCount === 0) {
    certificates = {
      score: null,
      weight: 15,
      label: 'Certificats & domaines',
      detail: 'Aucun monitoring SSL / WHOIS configure',
    };
  } else {
    const bad = inputs.certificates.inError + inputs.certificates.expired;
    const score = pct(inputs.certificates.monitoredCount - bad, inputs.certificates.monitoredCount);
    certificates = {
      score,
      weight: 15,
      label: 'Certificats & domaines',
      detail:
        `${inputs.certificates.monitoredCount} surveille${inputs.certificates.monitoredCount > 1 ? 's' : ''}` +
        (bad > 0 ? ` · ${bad} en erreur ou expire${bad > 1 ? 's' : ''}` : ' · OK'),
    };
  }

  // ---------- Sous-score 5 : uptime services surveilles ----------
  let uptime: Subscore;
  if (inputs.uptime.enabledMonitorsCount === 0 || inputs.uptime.totalChecks30d === 0) {
    uptime = {
      score: null,
      weight: 10,
      label: 'Uptime services (30j)',
      detail: 'Aucun service surveille',
    };
  } else {
    const score = pct(inputs.uptime.upChecks30d, inputs.uptime.totalChecks30d);
    uptime = {
      score,
      weight: 10,
      label: 'Uptime services (30j)',
      detail: `${inputs.uptime.enabledMonitorsCount} monitor${inputs.uptime.enabledMonitorsCount > 1 ? 's' : ''} · ${score.toFixed(2)}%`,
    };
  }

  // ---------- Sous-score 6 : documentation client (IT Glue / procedures) ----------
  // Trois categories binaires : FlexibleAssets (infra documentee), DocPages
  // (procedures), Networks/Locations (cartographie). Chaque categorie remplie
  // vaut 33.33 ; on note 0 a 100.
  const docCategories =
    (inputs.documentation.flexibleAssetsCount > 0 ? 1 : 0) +
    (inputs.documentation.docPagesCount > 0 ? 1 : 0) +
    (inputs.documentation.networksOrLocationsCount > 0 ? 1 : 0);
  const documentation: Subscore = {
    score: (docCategories / 3) * 100,
    weight: 10,
    label: 'Documentation client',
    detail: `${docCategories}/3 categories renseignees (infra, procedures, reseau/sites)`,
  };

  // ---------- Agregat global ----------
  const subscores = { mfa, alerts, assetHygiene, certificates, uptime, documentation };
  const applicable = Object.values(subscores).filter((s) => s.score !== null);

  let globalScore: number | null = null;
  if (applicable.length > 0) {
    const weightedSum = applicable.reduce(
      (acc, s) => acc + (s.score as number) * s.weight,
      0,
    );
    const totalWeight = applicable.reduce((acc, s) => acc + s.weight, 0);
    globalScore = Math.round(weightedSum / totalWeight);
  }

  // ---------- Generateur de recommandations ----------
  const recs: Recommendation[] = [];

  if (mfa.score !== null && mfa.score < 80) {
    const missing = inputs.m365.enabledUsers - inputs.m365.usersWithMfa;
    recs.push({
      priority: mfa.score < 50 ? 1 : 2,
      title: `Activer MFA sur ${missing} utilisateur${missing > 1 ? 's' : ''} M365 restant${missing > 1 ? 's' : ''}`,
      linkPath: null,
    });
  }
  if (inputs.m365.openAlerts.high > 0) {
    recs.push({
      priority: 1,
      title: `Traiter ${inputs.m365.openAlerts.high} alerte${inputs.m365.openAlerts.high > 1 ? 's' : ''} M365 de severite haute`,
      linkPath: null,
    });
  }
  if (inputs.m365.openAlerts.medium >= 3) {
    recs.push({
      priority: 2,
      title: `Examiner ${inputs.m365.openAlerts.medium} alertes M365 de severite moyenne`,
      linkPath: null,
    });
  }
  if (inputs.assets.expiredCount > 0) {
    recs.push({
      priority: 1,
      title: `Renouveler ou archiver ${inputs.assets.expiredCount} asset${inputs.assets.expiredCount > 1 ? 's' : ''} expire${inputs.assets.expiredCount > 1 ? 's' : ''}`,
      linkPath: null,
    });
  }
  if (inputs.assets.expiringSoonCount > 0) {
    recs.push({
      priority: 2,
      title: `Planifier le renouvellement de ${inputs.assets.expiringSoonCount} asset${inputs.assets.expiringSoonCount > 1 ? 's' : ''} expirant <30j`,
      linkPath: null,
    });
  }
  if (inputs.certificates.expired > 0 || inputs.certificates.inError > 0) {
    const total = inputs.certificates.expired + inputs.certificates.inError;
    recs.push({
      priority: 1,
      title: `${total} certificat${total > 1 ? 's' : ''}/domaine${total > 1 ? 's' : ''} en erreur ou expire${total > 1 ? 's' : ''}`,
      linkPath: null,
    });
  }
  if (uptime.score !== null && uptime.score < 99) {
    recs.push({
      priority: uptime.score < 95 ? 1 : 3,
      title: `Uptime ${(uptime.score as number).toFixed(2)}% sous le seuil 99% — investiguer les incidents recents`,
      linkPath: null,
    });
  }
  if (documentation.score !== null && documentation.score < 100) {
    const missing: string[] = [];
    if (inputs.documentation.flexibleAssetsCount === 0) missing.push('infrastructure (FlexibleAssets)');
    if (inputs.documentation.docPagesCount === 0) missing.push('procedures (DocPages)');
    if (inputs.documentation.networksOrLocationsCount === 0) missing.push('reseau/sites');
    if (missing.length > 0) {
      recs.push({
        priority: 3,
        title: `Completer la documentation : ${missing.join(', ')}`,
        linkPath: null,
      });
    }
  }

  // Tri par priorite croissante (1 = haute en premier)
  recs.sort((a, b) => a.priority - b.priority);

  return {
    score: globalScore,
    level: levelFor(globalScore),
    subscores,
    recommendations: recs,
  };
}
