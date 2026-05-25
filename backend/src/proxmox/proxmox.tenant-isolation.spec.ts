// Anti-regression : ProxmoxService doit scope toutes ses queries CRUD et
// timeseries par tenant. L'ingest webhook est volontairement non-scope
// (auth par secret), mais le lookup du cluster + le secret hash garantissent
// l'isolation : un attaquant qui devine un cluster_id ne peut rien faire
// sans le bon token (compare en timing-safe).

import * as fs from 'fs';
import * as path from 'path';

describe('ProxmoxService — tenant isolation', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'proxmox.service.ts'),
    'utf-8',
  );

  it('injecte TenantScope dans le constructeur', () => {
    expect(source).toMatch(/scope:\s*TenantScope/);
  });

  it('list() scope par tenant', () => {
    expect(source).toMatch(/list\s*\(\s*me:\s*JwtUser/);
    expect(source).toMatch(/proxmoxCluster\.findMany\(\{\s*where:\s*this\.scope\.scopedWhere\(me/);
  });

  it('findOne utilise findFirst + scopedWhere (defense profondeur)', () => {
    expect(source).toMatch(/proxmoxCluster\.findFirst\(\{\s*where:\s*this\.scope\.scopedWhere\(me/);
  });

  it('create copie le tenantId de la Company (pas du caller — defense profondeur)', () => {
    expect(source).toMatch(/assertCompanyInTenant\(input\.companyId,\s*me\)/);
    expect(source).toMatch(/tenantId:\s*company\.tenantId/);
  });

  it('update/remove/rotateSecret passent par findOne(id, me) avant operation', () => {
    expect(source).toMatch(/async update[\s\S]{0,200}findOne\(id,\s*me\)/);
    expect(source).toMatch(/async remove[\s\S]{0,200}findOne\(id,\s*me\)/);
    expect(source).toMatch(/async rotateSecret[\s\S]{0,200}findOne\(id,\s*me\)/);
  });

  it('timeseries et latestSnapshot passent par findOne(id, me)', () => {
    expect(source).toMatch(/async timeseries[\s\S]{0,200}findOne\(clusterId,\s*me\)/);
    expect(source).toMatch(/async latestSnapshot[\s\S]{0,200}findOne\(clusterId,\s*me\)/);
  });

  it('ingestViaSecret compare le hash en timing-safe', () => {
    expect(source).toMatch(/timingSafeEqualHex/);
  });

  it('secret stocke hashe SHA-256, jamais en clair', () => {
    expect(source).toMatch(/createHash\('sha256'\)\.update\(/);
  });

  it('cron overdue check : try/catch racine (ne crash pas le scheduler)', () => {
    // Pattern aligne sur backup.service.ts et autres crons audites.
    expect(source).toMatch(/runOverdueCheck[\s\S]{0,300}try\s*\{[\s\S]+?\}\s*catch/);
  });
});
