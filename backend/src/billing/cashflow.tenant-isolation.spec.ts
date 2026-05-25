// Anti-regression du fix audit 2026-05 : CashFlowService.overview() aggregait
// toutes les Invoice / BankTransaction sans filtre tenant -> leak des chiffres
// commerciaux entre tenants. Verifie par lecture du source (defense contre
// reintroduction silencieuse).

import * as fs from 'fs';
import * as path from 'path';

describe('CashFlowService.overview — tenant isolation', () => {
  const source = fs.readFileSync(
    path.join(__dirname, 'cashflow.service.ts'),
    'utf-8',
  );

  it('accepte un parametre me: JwtUser', () => {
    expect(source).toMatch(/overview\s*\(\s*me:\s*JwtUser/);
  });

  it('injecte TenantScope via le constructeur', () => {
    expect(source).toMatch(/scope:\s*TenantScope/);
  });

  it('passe par scope.scopedWhere() pour les aggregations invoice', () => {
    // Au moins 4 occurrences : 30j / 60j / 90j / top10
    const matches = source.match(/this\.scope\.scopedWhere\(me/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });

  it('aucune aggregation invoice sans scopedWhere (regression)', () => {
    // Toute clause where d'aggregate sur invoice doit etre wrappee par scopedWhere
    const invoiceAggregates = source.match(/prisma\.invoice\.(aggregate|findMany)\(\{\s*where:\s*([^,]+)/g) ?? [];
    for (const m of invoiceAggregates) {
      expect(m).toMatch(/this\.scope\.scopedWhere\(me/);
    }
  });

  it('aucune aggregation bankTransaction sans scopedWhere (regression)', () => {
    const bankAggregates = source.match(/prisma\.bankTransaction\.aggregate\(\{\s*where:\s*([^,]+)/g) ?? [];
    for (const m of bankAggregates) {
      expect(m).toMatch(/this\.scope\.scopedWhere\(me/);
    }
  });
});
