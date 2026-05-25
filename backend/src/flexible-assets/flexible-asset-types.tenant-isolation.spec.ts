// Anti-regression du fix multi-tenant 0003 : FlexibleAssetTypesService ne
// scopait pas par tenant, et le name etait @unique global. Verifie que les
// queries sont scopees et que les creates passent tenantId.

import * as fs from 'fs';
import * as path from 'path';

describe('FlexibleAssetTypesService — tenant isolation', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'flexible-asset-types.service.ts'),
    'utf-8',
  );

  it('injecte TenantScope dans le constructeur', () => {
    expect(source).toMatch(/scope:\s*TenantScope/);
  });

  it('list(me) scope les types par tenant', () => {
    expect(source).toMatch(/list\s*\(\s*me:\s*JwtUser/);
    expect(source).toMatch(/flexibleAssetType\.findMany\(\{\s*where:\s*this\.scope\.scopedWhere\(me/);
  });

  it('findOne utilise findFirst + scopedWhere', () => {
    // L'entry point public passe par findFirst scope. Le seul findUnique
    // residuel est dans le RETURN d'une transaction update() ou findOne(me)
    // a deja asserted l'ownership ligne du dessus.
    expect(source).toMatch(/findOne\([\s\S]{0,80}flexibleAssetType\.findFirst\(\{\s*where:\s*this\.scope\.scopedWhere\(me/);
  });

  it('create passe tenantId du caller', () => {
    expect(source).toMatch(/flexibleAssetType\.create\(\{[\s\S]*?tenantId:\s*me\.tenantId/);
  });
});
