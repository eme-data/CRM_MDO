import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  // Liste : on retourne les templates partages (ownerId=null) + les siens
  async listForUser(userId: string, category?: string) {
    const where: Prisma.ResponseTemplateWhereInput = {
      OR: [{ ownerId: null }, { ownerId: userId }],
    };
    if (category) where.category = category;
    return this.prisma.responseTemplate.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, userId: string) {
    const t = await this.prisma.responseTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException();
    // tout le monde peut LIRE les templates partages, on autorise aussi les siens
    if (t.ownerId && t.ownerId !== userId) throw new ForbiddenException();
    return t;
  }

  async create(
    userId: string,
    data: { name: string; body: string; subject?: string; category?: string; shared?: boolean },
  ) {
    return this.prisma.responseTemplate.create({
      data: {
        name: data.name,
        body: data.body,
        subject: data.subject,
        category: data.category,
        ownerId: data.shared ? null : userId,
      },
    });
  }

  async update(
    id: string,
    userId: string,
    userRole: string,
    data: { name?: string; body?: string; subject?: string; category?: string; shared?: boolean },
  ) {
    const t = await this.prisma.responseTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException();
    const isOwner = t.ownerId === userId;
    const canEditShared = !t.ownerId && (userRole === 'ADMIN' || userRole === 'MANAGER');
    if (!isOwner && !canEditShared) throw new ForbiddenException();

    const updateData: Prisma.ResponseTemplateUpdateInput = {
      name: data.name,
      body: data.body,
      subject: data.subject,
      category: data.category,
    };
    if (data.shared !== undefined) {
      updateData.owner =
        data.shared ? { disconnect: true } : { connect: { id: userId } };
    }
    return this.prisma.responseTemplate.update({ where: { id }, data: updateData });
  }

  async remove(id: string, userId: string, userRole: string) {
    const t = await this.prisma.responseTemplate.findUnique({ where: { id } });
    if (!t) throw new NotFoundException();
    const isOwner = t.ownerId === userId;
    const canDeleteShared = !t.ownerId && (userRole === 'ADMIN' || userRole === 'MANAGER');
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
