// Tests anti-regression du fix 3c2b435 (audit pass 2, 2026-05-17).
// quotes.convertToContract creait un Contract sans heriter du tenantId du
// Quote source → contract orphelin invisible aux queries scope. Aussi la
// sequence MDO-YYYY-NNNN cherchait cross-tenant (collisions DSI).
//
// Ces tests verifient via inspection statique du code source que les fixes
// sont en place. Pas de mock complet du service (chain de deps trop lourde)
// — on lit le service compile et on cherche les patterns attendus.

import * as fs from 'fs';
import * as path from 'path';

describe('QuotesService.convertToContract — tenant isolation (anti-regression)', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'quotes.service.ts'),
    'utf-8',
  );

  it('Contract create herite tenantId du Quote source', () => {
    // On cherche le pattern : tenantId: q.tenantId dans le data du tx.contract.create
    const convertSection = source.match(/async convertToContract[\s\S]+?(?=\n  async \w|\n}$)/);
    expect(convertSection).not.toBeNull();
    expect(convertSection![0]).toMatch(/tenantId:\s*q\.tenantId/);
  });

  it('sequence MDO-YYYY-NNNN scopee par tenantId', () => {
    // findFirst pour la sequence doit filtrer par tenantId pour eviter les
    // collisions cross-tenant en multi-instance DSI.
    expect(source).toMatch(/findFirst\(\{\s*where:\s*\{\s*tenantId,\s*reference/);
  });
});
