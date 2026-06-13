import { StockService } from './stock.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

// Couverture anti-regression du cloisonnement du module Stock (valorisation PMP,
// mouvements multi-emplacements). Le scope passe par TenantScope.scopedWhere(me).

const userA = {
  id: 'u-A', email: 'a@x.fr', firstName: 'A', lastName: '',
  role: 'ADMIN', tenantId: 'tenant-A', isSuperAdmin: false,
} as unknown as JwtUser;
const superAdmin = {
  id: 'u-S', email: 's@x.fr', firstName: 'S', lastName: '',
  role: 'ADMIN', tenantId: 'tenant-mdo', isSuperAdmin: true,
} as unknown as JwtUser;

describe('StockService — tenant isolation', () => {
  let service: StockService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
      stockItem: { findFirst: jest.fn() },
    };
    service = new StockService(prisma, new TenantScope(prisma));
  });

  it('listMovements scope par tenantId (scopedWhere)', async () => {
    await service.listMovements(userA, 'it-1');
    const where = prisma.stockMovement.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('tenant-A');
    expect(where.itemId).toBe('it-1');
  });

  it('super-admin : pas de filtre tenant', async () => {
    await service.listMovements(superAdmin);
    expect(prisma.stockMovement.findMany.mock.calls[0][0].where).not.toHaveProperty('tenantId');
  });

  it('getItem refuse (404) un article d\'un autre tenant + scope le findFirst', async () => {
    prisma.stockItem.findFirst.mockResolvedValue(null);
    await expect(service.getItem(userA, 'it-X')).rejects.toThrow();
    expect(prisma.stockItem.findFirst.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ id: 'it-X', tenantId: 'tenant-A' }),
    );
  });
});
