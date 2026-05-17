// Tests anti-regression du fix f1bb1ba (audit pass 4, 2026-05-17).
// signature.propagateSignatureToEntity faisait findUnique sur Quote/Contract
// sans tenantId — defense profondeur fixed via findFirst({ id, tenantId }).
//
// Verification statique : on lit le source et on cherche les patterns attendus.

import * as fs from 'fs';
import * as path from 'path';

describe('SignatureService.propagateSignatureToEntity — tenant isolation', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'signature.service.ts'),
    'utf-8',
  );

  it('signature de la methode prend tenantId en parametre', () => {
    expect(source).toMatch(
      /propagateSignatureToEntity\(\s*entityType:\s*SignableEntityType,\s*entityId:\s*string,\s*tenantId:\s*string\s*\|\s*null/,
    );
  });

  it('Quote.findFirst filtre par tenantId (et plus de findUnique sans scope)', () => {
    // Toute la methode propagate doit utiliser findFirst({ tenantId }) sur Quote.
    expect(source).toMatch(/prisma\.quote\.findFirst\(\{\s*where:\s*\{\s*id:\s*entityId,\s*tenantId\s*\}/);
    // ET le findUnique sans tenantId d'avant le fix doit avoir disparu sur Quote.
    expect(source).not.toMatch(/prisma\.quote\.findUnique\(\{\s*where:\s*\{\s*id:\s*entityId\s*\}/);
  });

  it('Contract.findFirst filtre par tenantId', () => {
    expect(source).toMatch(/prisma\.contract\.findFirst\(\{\s*where:\s*\{\s*id:\s*entityId,\s*tenantId\s*\}/);
    expect(source).not.toMatch(/prisma\.contract\.findUnique\(\{\s*where:\s*\{\s*id:\s*entityId\s*\}/);
  });

  it('caller propagateSignatureToEntity passe sig.tenantId', () => {
    expect(source).toMatch(
      /propagateSignatureToEntity\(\s*sig\.entityType[\s\S]*?,\s*sig\.entityId,\s*sig\.tenantId\s*\)/,
    );
  });
});
