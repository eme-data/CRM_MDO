import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma, SubprocessorRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SUBPROCESSOR_SEEDS } from './subprocessors.seeds';

@Injectable()
export class SubprocessorsService implements OnModuleInit {
  private readonly logger = new Logger(SubprocessorsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Seed initial : si la table est vide, charge les sous-traitants types
    // d'un MSP francais. L'utilisateur peut ensuite editer / supprimer.
    const count = await this.prisma.subprocessor.count();
    if (count === 0) {
      for (const s of SUBPROCESSOR_SEEDS) {
        await this.prisma.subprocessor.create({ data: s as any });
      }
      this.logger.log('Sous-traitants RGPD seedes : ' + SUBPROCESSOR_SEEDS.length);
    }
  }

  list(params: { includeInactive?: boolean; role?: SubprocessorRole } = {}) {
    return this.prisma.subprocessor.findMany({
      where: {
        ...(params.includeInactive ? {} : { isActive: true }),
        ...(params.role ? { role: params.role } : {}),
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const s = await this.prisma.subprocessor.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Sous-traitant introuvable');
    return s;
  }

  async create(input: any) {
    return this.prisma.subprocessor.create({ data: input });
  }

  async update(id: string, input: Partial<Prisma.SubprocessorUpdateInput>) {
    await this.findOne(id);
    return this.prisma.subprocessor.update({ where: { id }, data: input });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.subprocessor.delete({ where: { id } });
    return { ok: true };
  }
}
