import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

export interface RenderContext {
  ticket?: {
    reference?: string;
    title?: string;
    company?: { name?: string };
    contact?: { firstName?: string; lastName?: string };
  };
  user?: { firstName?: string; lastName?: string; signature?: string | null };
}

@Injectable()
export class ResponseTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
  ) {}

  // Liste : on retourne les templates partages du tenant (ownerId=null) +
  // les templates persos de l'utilisateur — strictement scopes au tenant.
  async listForUser(me: JwtUser, category?: string) {
    const where: Prisma.ResponseTemplateWhereInput = {
      ...this.scope.scopedWhere(me),
      OR: [{ ownerId: null }, { ownerId: me.id }],
    };
    if (category) where.category = category;
    return this.prisma.responseTemplate.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, me: JwtUser) {
    const t = await this.prisma.responseTemplate.findFirst({
      where: this.scope.scopedWhere(me, { id }),
    });
    if (!t) throw new NotFoundException();
    // tout le monde peut LIRE les templates partages, on autorise aussi les siens
    if (t.ownerId && t.ownerId !== me.id) throw new ForbiddenException();
    return t;
  }

  async create(
    me: JwtUser,
    data: { name: string; body: string; subject?: string; category?: string; shared?: boolean },
  ) {
    return this.prisma.responseTemplate.create({
      data: {
        tenantId: me.tenantId,
        name: data.name,
        body: data.body,
        subject: data.subject,
        category: data.category,
        ownerId: data.shared ? null : me.id,
      },
    });
  }

  async update(
    id: string,
    me: JwtUser,
    data: { name?: string; body?: string; subject?: string; category?: string; shared?: boolean },
  ) {
    const t = await this.prisma.responseTemplate.findFirst({
      where: this.scope.scopedWhere(me, { id }),
    });
    if (!t) throw new NotFoundException();
    const isOwner = t.ownerId === me.id;
    const canEditShared = !t.ownerId && (me.role === 'ADMIN' || me.role === 'MANAGER');
    if (!isOwner && !canEditShared) throw new ForbiddenException();

    const updateData: Prisma.ResponseTemplateUpdateInput = {
      name: data.name,
      body: data.body,
      subject: data.subject,
      category: data.category,
    };
    if (data.shared !== undefined) {
      updateData.owner =
        data.shared ? { disconnect: true } : { connect: { id: me.id } };
    }
    return this.prisma.responseTemplate.update({ where: { id }, data: updateData });
  }

  async remove(id: string, me: JwtUser) {
    const t = await this.prisma.responseTemplate.findFirst({
      where: this.scope.scopedWhere(me, { id }),
    });
    if (!t) throw new NotFoundException();
    const isOwner = t.ownerId === me.id;
    const canDeleteShared = !t.ownerId && (me.role === 'ADMIN' || me.role === 'MANAGER');
    if (!isOwner && !canDeleteShared) throw new ForbiddenException();
    await this.prisma.responseTemplate.delete({ where: { id } });
    return { success: true };
  }

  // Rendu : remplace les variables {{ticket.reference}}, {{user.firstName}}, etc.
  render(template: string, ctx: RenderContext): string {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path) => {
      const value = path.split('.').reduce((acc: any, key: string) => acc?.[key], ctx);
      return value != null ? String(value) : match;
    });
  }
}
