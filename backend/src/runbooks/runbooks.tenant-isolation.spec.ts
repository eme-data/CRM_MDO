// Anti-regression du fix multi-tenant 0003 : RunbooksService avait un modele
// "catalogue partage" geré par super-admin, abandonné en faveur du full
// multi-tenant. Verifie que les queries sur Runbook sont desormais scopees.

import * as fs from 'fs';
import * as path from 'path';

describe('RunbooksService — tenant isolation', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'runbooks.service.ts'),
    'utf-8',
  );

  it('list(me) scope les runbooks par tenant', () => {
    expect(source).toMatch(/list\s*\(\s*me:\s*JwtUser/);
    expect(source).toMatch(/runbook\.findMany\(\{\s*where:\s*this\.scope\.scopedWhere\(me/);
  });

  it('findOne utilise findFirst + scopedWhere', () => {
    expect(source).toMatch(/runbook\.findFirst\(\{\s*where:\s*this\.scope\.scopedWhere\(me/);
  });

  it('create passe tenantId du caller', () => {
    expect(source).toMatch(/runbook\.create\(\{[\s\S]*?tenantId:\s*me\.tenantId/);
  });

  it('plus de garde "catalogue partage super-admin" (assertCatalogAdmin function)', () => {
    // On verifie l'absence de la DEFINITION/APPEL de la function, pas du mot
    // (le commentaire d'historique peut le mentionner).
    expect(source).not.toMatch(/private\s+assertCatalogAdmin/);
    expect(source).not.toMatch(/this\.assertCatalogAdmin\(/);
  });
});
