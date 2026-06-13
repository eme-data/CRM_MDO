import { ExpensesService } from './expenses.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

// Couverture anti-regression du cloisonnement du module Frais (SIRH). Le scope
// passe par TenantScope.scopedWhere(me) ; listPending est reserve aux valideurs.

const userA = {
  id: 'u-A', email: 'a@x.fr', firstName: 'A', lastName: '',
  role: 'ADMIN', tenantId: 'tenant-A', isSuperAdmin: false,
} as unknown as JwtUser;
const superAdmin = {
  id: 'u-S', email: 's@x.fr', firstName: 'S', lastName: '',
  role: 'ADMIN', tenantId: 'tenant-mdo', isSuperAdmin: true,
} as unknown as JwtUser;

describe('ExpensesService — tenant isolation', () => {
  let service: ExpensesService;
  let prisma: any;

  beforeEach(() => {
    prisma = { expenseClaim: { findMany: jest.fn().mockResolvedValue([]) } };
    service = new ExpensesService(prisma, new TenantScope(prisma), {} as any, {} as any, {} as any);
  });

  it('listPending scope par tenantId + filtre PENDING', async () => {
    await service.listPending(userA);
    const where = prisma.expenseClaim.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('tenant-A');
    expect(where.status).toBe('PENDING');
  });

  it('super-admin : pas de filtre tenant', async () => {
    await service.listPending(superAdmin);
    expect(prisma.expenseClaim.findMany.mock.calls[0][0].where).not.toHaveProperty('tenantId');
  });
});
