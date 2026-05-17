// Tests anti-regression du fix 3c2b435 (audit pass 2, 2026-05-17).
// billing.pushCompany faisait assertCompanyInTenant puis findUnique({ id })
// sans re-filtrer. Defense profondeur fixed : findFirst({ id, tenantId })
// (sauf super-admin qui bypass).
//
// Verification statique sur le source.

import * as fs from 'fs';
import * as path from 'path';

describe('BillingService.pushCompany — tenant isolation (defense profondeur)', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'billing.service.ts'),
    'utf-8',
  );

  it('appelle scope.assertCompanyInTenant avant tout fetch', () => {
    // Le service garde le check d'autorisation primaire
    expect(source).toMatch(/pushCompany[\s\S]+?scope\.assertCompanyInTenant\(/);
  });

  it('utilise findFirst (pas findUnique) avec filtre tenantId', () => {
    // Defense profondeur : meme apres assert, on re-filtre par tenantId au
    // findFirst (un dev qui retire l'assert par erreur ne crée pas un leak).
    expect(source).toMatch(
      /company\.findFirst\(\{\s*where:\s*me\.isSuperAdmin\s*\?\s*\{\s*id:\s*companyId\s*\}\s*:\s*\{\s*id:\s*companyId,\s*tenantId:\s*me\.tenantId\s*\}/,
    );
  });

  it('pas de findUnique({ where: { id: companyId } }) regression', () => {
    // L'ancien pattern doit avoir disparu
    expect(source).not.toMatch(/prisma\.company\.findUnique\(\{\s*where:\s*\{\s*id:\s*companyId\s*\}/);
  });
});
