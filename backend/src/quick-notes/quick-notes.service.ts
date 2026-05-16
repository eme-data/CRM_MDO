import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

export interface UpsertQuickNoteDto {
  companyId: string;
  content: string;
  color?: string;
  pinned?: boolean;
}

@Injectable()
export class QuickNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
  ) {}

  async listForCompany(companyId: string, me: JwtUser) {
    await this.scope.assertCompanyInTenant(companyId, me);
    return this.prisma.quickNote.findMany({
      where: { companyId },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async create(dto: UpsertQuickNoteDto, me: JwtUser) {
    await this.scope.assertCompanyInTenant(dto.companyId, me);
    return this.prisma.quickNote.create({
      data: {
        tenantId: me.tenantId,
        companyId: dto.companyId,
        content: dto.content,
        color: dto.color,
        pinned: dto.pinned ?? true,
        authorId: me.id,
      },
    });
  }

  async update(id: string, dto: Partial<UpsertQuickNoteDto>, me: JwtUser) {
    const existing = await this.prisma.quickNote.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      select: { id: true },
    });
    if (!existing) throw new NotFoundException();
    return this.prisma.quickNote.update({
      where: { id },
      data: {
        content: dto.content,
        color: dto.color,
        pinned: dto.pinned,
      },
    });
  }

  async remove(id: string, me: JwtUser) {
    const existing = await this.prisma.quickNote.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      select: { id: true },
    });
    if (!existing) throw new NotFoundException();
    await this.prisma.quickNote.delete({ where: { id } });
    return { success: true };
  }
}
