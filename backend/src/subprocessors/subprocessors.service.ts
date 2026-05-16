import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma, SubprocessorRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { SUBPROCESSOR_SEEDS } from './subprocessors.seeds';

@Injectable()
export class SubprocessorsService implements OnModuleInit {
  private readonly logger = new Logger(SubprocessorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
  ) {}

  async onModuleInit() {
    // Seed initial : si aucun sous-traitant n'existe pour le tenant 'mdo',
    // charge les seeds. Pour les autres tenants, le seed se fait a la
    // creation via TenantsService.create -> SubprocessorsService.seedForTenant
    // (a brancher si besoin par tenant). Pour l'instant : seed mdo uniquement.
    const mdoTenant = await this.prisma.tenant.findUnique({ where: { slug: 'mdo' } });
    if (!mdoTenant) return; // pas encore initialise (premier boot)
    const count = await this.prisma.subprocessor.count({ where: { tenantId: mdoTenant.id } });
    if (count === 0) {
      for (const s of SUBPROCESSOR_SEEDS) {
        await this.prisma.subprocessor.create({ data: { ...s, tenantId: mdoTenant.id } as any });
      }
      this.logger.log('Sous-traitants RGPD seedes pour mdo : ' + SUBPROCESSOR_SEEDS.length);
    }
  }

  list(me: JwtUser, params: { includeInactive?: boolean; role?: SubprocessorRole } = {}) {
    return this.prisma.subprocessor.findMany({
      where: this.scope.scopedWhere(me, {
        ...(params.includeInactive ? {} : { isActive: true }),
        ...(params.role ? { role: params.role } : {}),
      }),
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, me: JwtUser) {
    const s = await this.prisma.subprocessor.findFirst({
      where: this.scope.scopedWhere(me, { id }),
    });
    if (!s) throw new NotFoundException('Sous-traitant introuvable');
    return s;
  }

  async create(input: any, me: JwtUser) {
    return this.prisma.subprocessor.create({
      data: { ...input, tenantId: me.tenantId },
    });
  }

  async update(id: string, input: Partial<Prisma.SubprocessorUpdateInput>, me: JwtUser) {
    await this.findOne(id, me);
    return this.prisma.subprocessor.update({ where: { id }, data: input });
  }

  async remove(id: string, me: JwtUser) {
    await this.findOne(id, me);
    await this.prisma.subprocessor.delete({ where: { id } });
    return { ok: true };
  }
}
