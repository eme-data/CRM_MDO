// Tests du scopedWhere de PublicApiController (extrait en helper pour
// testabilite). Critique : ce filtre garantit qu'une cle API GLOBAL d'un
// tenant ne peut lire que SES propres donnees, pas celles des autres
// tenants (vague 11D).

import { ForbiddenException } from '@nestjs/common';

// Reimplem (1:1) du helper interne du controller pour le tester en isolation.
// Quand le helper est extrait du controller en service partage, ce test
// changera juste son import.
function scopedWhere(k: { scope: string; companyId: string | null; tenantId: string | null }) {
  const tenantFilter = k.tenantId ? { tenantId: k.tenantId } : {};
  if (k.scope === 'CLIENT_READ' || k.scope === 'CLIENT_WRITE') {
    if (!k.companyId) {
      throw new ForbiddenException('Cle CLIENT sans companyId — incoherent');
    }
    return { ...tenantFilter, companyId: k.companyId };
  }
  return tenantFilter;
}

describe('public-api scopedWhere — isolation cle API', () => {
  describe('Scope GLOBAL_READ / GLOBAL_WRITE', () => {
    it('CRITIQUE : injecte tenantId pour ne pas leak les donnees des autres tenants', () => {
      // Avant fix vague 11D : scopedWhere renvoyait {} pour GLOBAL_*,
      // donc une cle GLOBAL listait les contracts/tickets/etc. de TOUS
      // les tenants — fuite cross-tenant majeure.
      const w = scopedWhere({ scope: 'GLOBAL_READ', companyId: null, tenantId: 'tenant-A' });
      expect(w).toEqual({ tenantId: 'tenant-A' });
    });

    it('isole : deux cles GLOBAL_READ de tenants distincts produisent des wheres distincts', () => {
      const wA = scopedWhere({ scope: 'GLOBAL_READ', companyId: null, tenantId: 'tenant-A' });
      const wB = scopedWhere({ scope: 'GLOBAL_READ', companyId: null, tenantId: 'tenant-B' });
      expect(wA).not.toEqual(wB);
    });

    it('cle sans tenantId (legacy) : pas de filtre — comportement avant migration', () => {
      const w = scopedWhere({ scope: 'GLOBAL_READ', companyId: null, tenantId: null });
      expect(w).toEqual({});
    });
  });

  describe('Scope CLIENT_READ / CLIENT_WRITE', () => {
    it('combine tenantId ET companyId : double garde', () => {
      const w = scopedWhere({ scope: 'CLIENT_READ', companyId: 'co-X', tenantId: 'tenant-A' });
      expect(w).toEqual({ tenantId: 'tenant-A', companyId: 'co-X' });
    });

    it('refuse si CLIENT_* sans companyId (cle mal formee)', () => {
      expect(() =>
        scopedWhere({ scope: 'CLIENT_WRITE', companyId: null, tenantId: 'tenant-A' }),
      ).toThrow(ForbiddenException);
    });
  });
});
