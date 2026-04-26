import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateDocPageDto } from './dto/create-doc-page.dto';

@Injectable()
export class ClientDocsService {
  constructor(private readonly prisma: PrismaService) {}

  listForCompany(companyId: string) {
    return this.prisma.docPage.findMany({
      where: { companyId },
      include: { author: { select: { firstName: true, lastName: true } } },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });
  }

  async findOne(id: string) {
    const p = await this.prisma.docPage.findUnique({
      where: { id },
      include: { author: { select: { firstName: true, lastName: true } } },
    });
    if (!p) throw new NotFoundException();
    return p;
  }

  create(dto: CreateDocPageDto, userId: string) {
    return this.prisma.docPage.create({ data: { ...dto, authorId: userId } });
  }

  async update(id: string, dto: Partial<CreateDocPageDto>, userId: string, reason?: string) {
    const existing = await this.findOne(id);
    // Snapshot AVANT modification pour permettre rollback
    await this.prisma.docPageVersion.create({
      data: {
        pageId: id,
        title: existing.title,
        category: existing.category,
        body: existing.body,
        authorId: existing.authorId,
        reason,
      },
    });
    return this.prisma.docPage.update({
      where: { id },
      data: { ...dto, authorId: userId },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.docPage.delete({ where: { id } });
    return { success: true };
  }

  // ----- Versioning -----

  async listVersions(pageId: string) {
    await this.findOne(pageId);
    return this.prisma.docPageVersion.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getVersion(versionId: string) {
    const v = await this.prisma.docPageVersion.findUnique({ where: { id: versionId } });
    if (!v) throw new NotFoundException('Version introuvable');
    return v;
  }

  // Restaure une version : cree d'abord un snapshot de l'etat courant,
  // puis ecrase le contenu de la page avec celui de la version cible.
  async restoreVersion(versionId: string, userId: string) {
    const v = await this.getVersion(versionId);
    const current = await this.findOne(v.pageId);
    await this.prisma.docPageVersion.create({
      data: {
        pageId: v.pageId,
        title: current.title,
        category: current.category,
        body: current.body,
        authorId: current.authorId,
        reason: 'Snapshot avant restauration de version ' + versionId.substring(0, 8),
      },
    });
    return this.prisma.docPage.update({
      where: { id: v.pageId },
      data: {
        title: v.title,
        category: v.category,
        body: v.body,
        authorId: userId,
      },
    });
  }
}
