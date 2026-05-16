import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateDocPageDto } from './dto/create-doc-page.dto';
import { JwtUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class ClientDocsService {
  constructor(private readonly prisma: PrismaService) {}

  // Garde-fou multi-tenant : verifie que le companyId appartient au tenant
  // courant (sauf super-admin qui voit tout).
  private async assertCompanyInTenant(companyId: string, me: JwtUser) {
    if (me.isSuperAdmin) return;
    const c = await this.prisma.company.findFirst({
      where: { id: companyId, tenantId: me.tenantId ?? undefined },
      select: { id: true },
    });
    if (!c) throw new ForbiddenException('Societe inaccessible dans ce tenant');
  }

  async listForCompany(companyId: string, me: JwtUser) {
    await this.assertCompanyInTenant(companyId, me);
    return this.prisma.docPage.findMany({
      where: { companyId },
      include: { author: { select: { firstName: true, lastName: true } } },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });
  }

  async findOne(id: string, me: JwtUser) {
    const where: any = { id };
    if (!me.isSuperAdmin) where.tenantId = me.tenantId;
    const p = await this.prisma.docPage.findFirst({
      where,
      include: { author: { select: { firstName: true, lastName: true } } },
    });
    if (!p) throw new NotFoundException();
    return p;
  }

  async create(dto: CreateDocPageDto, me: JwtUser) {
    await this.assertCompanyInTenant(dto.companyId, me);
    return this.prisma.docPage.create({
      data: { ...dto, tenantId: me.tenantId, authorId: me.id },
    });
  }

  async update(id: string, dto: Partial<CreateDocPageDto>, me: JwtUser, reason?: string) {
    const existing = await this.findOne(id, me);
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
      data: { ...dto, authorId: me.id },
    });
  }

  async remove(id: string, me: JwtUser) {
    await this.findOne(id, me);
    await this.prisma.docPage.delete({ where: { id } });
    return { success: true };
  }

  // ----- Versioning -----

  async listVersions(pageId: string, me: JwtUser) {
    await this.findOne(pageId, me);
    return this.prisma.docPageVersion.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getVersion(versionId: string, me: JwtUser) {
    const v = await this.prisma.docPageVersion.findUnique({ where: { id: versionId } });
    if (!v) throw new NotFoundException('Version introuvable');
    // Verifie que la page-mere appartient bien au tenant courant.
    await this.findOne(v.pageId, me);
    return v;
  }

  // Restaure une version : cree d'abord un snapshot de l'etat courant,
  // puis ecrase le contenu de la page avec celui de la version cible.
  async restoreVersion(versionId: string, me: JwtUser) {
    const v = await this.getVersion(versionId, me);
    const current = await this.findOne(v.pageId, me);
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
        authorId: me.id,
      },
    });
  }
}
