import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { JwtUser } from '../decorators/current-user.decorator';

// Helpers de scope multi-tenant utilises par tous les services CRUD apres
// la vague 11. Le pattern recurrent :
//   - assertCompanyInTenant(companyId, me) : avant un create avec FK companyId
//   - scopedWhere(me, extra?) : a injecter dans tout findMany/count/aggregate
//     sur un modele tenant-scope ; renvoie {} pour le super-admin
//   - assertEntityInTenant(model, id, me) : avant un update/delete par id
//
// Super-admin bypasse systematiquement (peut tout voir).
//
// Throw NotFoundException et pas ForbiddenException sur les acces cross-tenant
// pour eviter de reveler l'existence d'une entite dans un autre tenant.

@Injectable()
export class TenantScope {
  constructor(private readonly prisma: PrismaService) {}

  // Renvoie le clause where {} a injecter. Pour super-admin = pas de filtre.
  scopedWhere(me: JwtUser, extra: Record<string, any> = {}): Record<string, any> {
    if (me.isSuperAdmin) return extra;
    return { ...extra, tenantId: me.tenantId };
  }

  async assertCompanyInTenant(companyId: string, me: JwtUser): Promise<void> {
    if (me.isSuperAdmin) return;
    const c = await this.prisma.company.findFirst({
      where: { id: companyId, tenantId: me.tenantId ?? undefined },
      select: { id: true },
    });
    if (!c) throw new ForbiddenException('Societe inaccessible dans ce tenant');
  }

  // Verifie qu'une entite tenant-scope existe et appartient au tenant courant.
  // Renvoie l'entite (selectable). Throw 404 sinon (pas 403 : on ne revele
  // pas l'existence d'une entite dans un autre tenant).
  async assertEntityInTenant<T extends { id: string; tenantId: string | null }>(
    fetcher: (where: { id: string; tenantId?: string | null }) => Promise<T | null>,
    id: string,
    me: JwtUser,
  ): Promise<T> {
    const where: any = { id };
    if (!me.isSuperAdmin) where.tenantId = me.tenantId;
    const e = await fetcher(where);
    if (!e) throw new NotFoundException();
    return e;
  }
}
