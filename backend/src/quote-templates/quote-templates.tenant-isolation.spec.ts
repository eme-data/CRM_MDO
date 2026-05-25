// Anti-regression du fix multi-tenant 0003 : QuoteTemplatesService ne scopait
// AUCUNE de ses queries -> leak total des templates commerciaux entre tenants.
// Verification statique : toutes les queries passent par scope.scopedWhere(me)
// et tous les create passent tenantId.

import * as fs from 'fs';
import * as path from 'path';

describe('QuoteTemplatesService — tenant isolation', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'quote-templates.service.ts'),
    'utf-8',
  );

  it('injecte TenantScope dans le constructeur', () => {
    expect(source).toMatch(/scope:\s*TenantScope/);
  });

  it('list() prend un parametre me: JwtUser', () => {
    expect(source).toMatch(/list\s*\(\s*me:\s*JwtUser/);
  });

  it('findOne utilise findFirst + scopedWhere (pas findUnique)', () => {
    expect(source).toMatch(/quoteTemplate\.findFirst\(\{\s*where:\s*this\.scope\.scopedWhere\(me/);
    expect(source).not.toMatch(/quoteTemplate\.findUnique\(\{\s*where:\s*\{\s*id\s*\}/);
  });

  it('create passe tenantId du caller', () => {
    expect(source).toMatch(/quoteTemplate\.create\(\{[\s\S]*?tenantId:\s*me\.tenantId/);
  });
});
