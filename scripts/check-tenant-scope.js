#!/usr/bin/env node
// =============================================================================
// check-tenant-scope.js — Linter custom multi-tenant
// =============================================================================
// Scanne backend/src/**/*.ts a la recherche de queries Prisma sur des modeles
// tenant-scopes (= modeles avec colonne tenantId dans schema.prisma) qui ne
// sont PAS passees par TenantScope.scopedWhere(me, ...) ou un filtre tenantId
// explicite. Sort un rapport + exit 1 si violations.
//
// Usage :
//   node scripts/check-tenant-scope.js              (rapport humain, exit 0)
//   node scripts/check-tenant-scope.js --json       (rapport JSON pour CI)
//   node scripts/check-tenant-scope.js --strict     (exit 1 si violations)
//   node scripts/check-tenant-scope.js --baseline N (exit 1 si > N violations)
//
// Integration CI suggeree : commencer en mode --baseline (avec le count
// actuel) puis durcir progressivement en migrant les services restants.
//
//   - run: node scripts/check-tenant-scope.js --baseline 100
//
// Heuristique : on est volontairement large (true positives > false negatives)
// sur les modeles racine tenant-scopes. Faux positifs possibles sur :
// - services internes qui recoivent un where deja scope d'ailleurs
// - flows publics legitimes (status page, search global super-admin)
// Si une fausse alarme apparait, ajouter le fichier dans IGNORED_FILES ou
// un marqueur dans ACCEPTED_MARKERS.
// =============================================================================

const fs = require('fs');
const path = require('path');

const SCHEMA = path.join(__dirname, '..', 'backend', 'prisma', 'schema.prisma');
const SRC_DIR = path.join(__dirname, '..', 'backend', 'src');

// Fichiers exemptes : crons systeme, services tenants eux-memes, specs.
const IGNORED_FILES = [
  'tenants.service.ts',                    // c'est LE service qui gere les tenants
  'tenants.controller.ts',
  'prisma.service.ts',
  'metrics.service.ts',                    // metrics globales agreges intentionnels
  'cron-dashboard.service.ts',             // scheduler registry, pas de query metier
  'system-backup.service.ts',              // backup INSTANCE-level (super-admin)
];

// Patterns dans le contexte : pres d'une operation, ces marqueurs signalent
// qu'on est dans un flow legitimement non-scope (cron systeme global,
// resolution publique par token, etc.). Si vu dans les 400 chars precedents,
// on tolere. On accepte aussi les FK implicites (companyId/ticketId/userId
// etc.) qui referencent un parent tenant-scope -> l'isolation est garantie
// par construction via la FK + le check tenant cote parent.
const ACCEPTED_MARKERS = [
  // Helpers explicites
  'scopedWhere',
  'assertEntityInTenant',
  'assertCompanyInTenant',
  'assertOwnership',
  // Filtres tenant directs
  'tenantId:',
  'tenantId ',
  'tenantScope',                           // pattern alternatif vu dans ai.service
  // FK implicites (le parent est tenant-scope, donc l'enfant herite)
  'companyId:',
  'contactId:',
  'opportunityId:',
  'contractId:',
  'invoiceId:',
  'quoteId:',
  'ticketId:',
  'interventionId:',
  'taskId:',
  'userId:',
  'authorId:',
  'createdById:',
  'assigneeId:',
  'ownerId:',
  'siteId:',
  'locationId:',
  'assetId:',
  'noteId:',
  'attachmentId:',
  'parentId:',
  'webhookId:',
  'endpointId:',
  'campaignId:',
  'templateId:',
  'jobId:',
  'monitorId:',
  'documentId:',
  'enrollmentId:',
  'workflowRuleId:',
  'reviewId:',
  // Marqueurs de flow
  'me.isSuperAdmin',
  '@Cron(',
  'OnModuleInit',
  'webhook',
  'ingestViaSecret',
  'resolveByDomain',
  'portalAuth',
  'magicLink',
  'PortalSession',
  'findBySlugStrict',
  'recordRun(',
  // Crons systeme legitimes
  'runDailyBackup',
  'runOverdueCheck',
  'runDailyInner',
  'expirePending',
  'purgeOldChecks',
  'tick(',                                 // uptime tick global
  'runSealCron',                           // audit chain seal
  'runCleanup',
];

function parseSchemaForTenantModels(schemaPath) {
  const src = fs.readFileSync(schemaPath, 'utf8');
  const lines = src.split(/\r?\n/);
  const models = [];
  let currentModel = null;
  let hasTenantId = false;
  for (const line of lines) {
    const m = line.match(/^model\s+(\w+)\s*\{/);
    if (m) { currentModel = m[1]; hasTenantId = false; continue; }
    if (currentModel) {
      if (/^\s*tenantId\s+String/.test(line)) hasTenantId = true;
      if (/^\}/.test(line)) {
        if (hasTenantId) models.push(currentModel);
        currentModel = null;
        hasTenantId = false;
      }
    }
  }
  return models;
}

function listTsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listTsFiles(p));
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

function checkFile(file, tenantModels) {
  const violations = [];
  const fileName = path.basename(file);
  if (IGNORED_FILES.includes(fileName)) return violations;

  const src = fs.readFileSync(file, 'utf8');
  // Regex pour matcher `prisma.X.Y(...)` ou `tx.X.Y(...)` avec X=model camelCase
  // et Y=findMany/findFirst/findUnique/aggregate/count/groupBy/updateMany/deleteMany.
  // On capture aussi la position pour numero de ligne.
  const re = /(?:prisma|tx)\.(\w+)\.(findMany|findFirst|findUnique|aggregate|count|groupBy|updateMany|deleteMany)\s*\(/g;

  let m;
  while ((m = re.exec(src)) !== null) {
    const modelLower = m[1];
    const op = m[2];
    // Match model name (camelCase) avec le nom Pascal du schema
    const modelPascal = modelLower.charAt(0).toUpperCase() + modelLower.slice(1);
    if (!tenantModels.includes(modelPascal)) continue;

    // Calcule numero de ligne
    const before = src.slice(0, m.index);
    const lineNum = before.split('\n').length;

    // Contexte : 400 chars avant + 600 apres (couvre le where: {...} et la
    // fonction parente). Permet de detecter les scopes injectes via spread
    // ou des helpers locaux nommes.
    const ctxStart = Math.max(0, m.index - 400);
    const ctxEnd = Math.min(src.length, m.index + 600);
    const ctx = src.slice(ctxStart, ctxEnd);

    // Si un marqueur d'acceptation est present dans le contexte, on tolere.
    const isOk = ACCEPTED_MARKERS.some((mk) => ctx.includes(mk));
    if (!isOk) {
      violations.push({
        file: path.relative(path.join(__dirname, '..'), file),
        line: lineNum,
        model: modelPascal,
        op,
        snippet: src.slice(m.index, Math.min(src.length, m.index + 120)).replace(/\n/g, ' '),
      });
    }
  }
  return violations;
}

function main() {
  const jsonMode = process.argv.includes('--json');
  const strictMode = process.argv.includes('--strict');
  const baselineIdx = process.argv.indexOf('--baseline');
  const baseline = baselineIdx >= 0 ? parseInt(process.argv[baselineIdx + 1], 10) : null;
  if (!fs.existsSync(SCHEMA)) {
    console.error('schema.prisma introuvable : ' + SCHEMA);
    process.exit(2);
  }
  const tenantModels = parseSchemaForTenantModels(SCHEMA);
  if (tenantModels.length === 0) {
    console.error('Aucun modele tenant-scope trouve dans le schema.');
    process.exit(2);
  }

  const files = listTsFiles(SRC_DIR);
  const allViolations = [];
  for (const f of files) {
    allViolations.push(...checkFile(f, tenantModels));
  }

  if (jsonMode) {
    console.log(JSON.stringify({
      tenantModelsCount: tenantModels.length,
      filesScanned: files.length,
      violations: allViolations,
    }, null, 2));
  } else {
    console.log('=== Tenant-scope linter ===');
    console.log('Modeles tenant-scope detectes : ' + tenantModels.length);
    console.log('Fichiers scannes : ' + files.length);
    console.log('');
    if (allViolations.length === 0) {
      console.log('\x1b[32m[OK]\x1b[0m Aucune violation detectee.');
    } else {
      console.log('\x1b[31m[KO]\x1b[0m ' + allViolations.length + ' violation(s) detectee(s) :');
      console.log('');
      for (const v of allViolations) {
        console.log('  ' + v.file + ':' + v.line);
        console.log('    \x1b[33m' + v.model + '.' + v.op + '\x1b[0m sans scope tenant detecte');
        console.log('    > ' + v.snippet);
        console.log('');
      }
      console.log('Fix : passer par scope.scopedWhere(me, ...) ou ajouter');
      console.log('tenantId au where, ou ajouter un marqueur d\'acceptation');
      console.log('(@Cron, webhook, OnModuleInit, etc.) si le flow est legitime.');
    }
  }

  // Mode par defaut (warn) : exit 0 meme si violations.
  // --strict : exit 1 des qu'il y a une violation.
  // --baseline N : exit 1 si on depasse N violations (regression detection).
  if (strictMode) {
    process.exit(allViolations.length > 0 ? 1 : 0);
  }
  if (baseline !== null && !Number.isNaN(baseline)) {
    if (allViolations.length > baseline) {
      console.error('\n[FAIL] ' + allViolations.length + ' violations > baseline ' + baseline);
      process.exit(1);
    }
    if (!jsonMode) console.log('\n[OK] ' + allViolations.length + ' violations <= baseline ' + baseline);
    process.exit(0);
  }
  process.exit(0);
}

main();
