import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { KbScope, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

@Injectable()
export class KbService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // Slug unique : si collision, on suffixe -2, -3, ...
  // ============================================================
  private async uniqueSlug(base: string): Promise<string> {
    const slug = slugify(base) || 'article';
    const existing = await this.prisma.kbArticle.findMany({
      where: { slug: { startsWith: slug } },
      select: { slug: true },
    });
    if (existing.length === 0) return slug;
    if (!existing.find((e) => e.slug === slug)) return slug;
    let n = 2;
    while (existing.find((e) => e.slug === slug + '-' + n)) n++;
    return slug + '-' + n;
  }

  // ============================================================
  // Recherche / liste
  // ============================================================
  async search(params: {
    q?: string;
    scope?: KbScope;
    companyId?: string;
    category?: string;
    publishedOnly?: boolean;
  }) {
    const where: Prisma.KbArticleWhereInput = {};
    if (params.scope) where.scope = params.scope;
    if (params.companyId) {
      // Si on cible un client : on lui montre ses CLIENT articles + tous les
      // GLOBAL et INTERNAL (les INTERNAL sont seulement listes pour le tech
      // qui consulte la fiche, pas pour le portail — gere cote portail).
      where.OR = [
        { companyId: params.companyId },
        { scope: { in: ['GLOBAL', 'INTERNAL'] } },
      ];
    }
    if (params.category) where.category = params.category;
    if (params.publishedOnly) where.isPublished = true;
    if (params.q) {
      where.AND = [
        ...(where.OR ? [{ OR: where.OR }] : []),
        {
          OR: [
            { title: { contains: params.q, mode: 'insensitive' } },
            { content: { contains: params.q, mode: 'insensitive' } },
            { excerpt: { contains: params.q, mode: 'insensitive' } },
            { tags: { has: params.q.toLowerCase() } },
          ],
        },
      ];
      delete where.OR;
    }
    return this.prisma.kbArticle.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        scope: true,
        category: true,
        tags: true,
        isPublished: true,
        publishedAt: true,
        lastReviewedAt: true,
        viewCount: true,
        company: { select: { id: true, name: true } },
        author: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ isPublished: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
    });
  }

  async findOne(id: string, incrementView = false) {
    const a = await this.prisma.kbArticle.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
        company: { select: { id: true, name: true } },
      },
    });
    if (!a) throw new NotFoundException('Article introuvable');
    if (incrementView) {
      this.prisma.kbArticle.update({
        where: { id },
        data: { viewCount: { increment: 1 } },
      }).catch(() => {});
    }
    return a;
  }

  // ============================================================
  // CRUD
  // ============================================================
  async create(input: {
    title: string;
    content: string;
    excerpt?: string;
    scope?: KbScope;
    companyId?: string;
    category?: string;
    tags?: string[];
    isPublished?: boolean;
    sourceTicketId?: string;
  }, authorId: string) {
    if (input.scope === 'CLIENT' && !input.companyId) {
      throw new BadRequestException('Scope CLIENT requiert un companyId');
    }
    const slug = await this.uniqueSlug(input.title);
    return this.prisma.kbArticle.create({
      data: {
        title: input.title,
        slug,
        content: input.content,
        excerpt: input.excerpt,
        scope: input.scope ?? 'INTERNAL',
        companyId: input.companyId,
        category: input.category,
        tags: input.tags ?? [],
        isPublished: input.isPublished ?? false,
        publishedAt: input.isPublished ? new Date() : null,
        sourceTicketId: input.sourceTicketId,
        authorId,
      },
    });
  }

  async update(id: string, input: {
    title?: string;
    content?: string;
    excerpt?: string | null;
    scope?: KbScope;
    companyId?: string | null;
    category?: string | null;
    tags?: string[];
    isPublished?: boolean;
    markReviewed?: boolean;
  }) {
    const existing = await this.findOne(id);
    const data: Prisma.KbArticleUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.content !== undefined) data.content = input.content;
    if (input.excerpt !== undefined) data.excerpt = input.excerpt;
    if (input.scope !== undefined) data.scope = input.scope;
    if (input.companyId !== undefined) {
      data.company = input.companyId ? { connect: { id: input.companyId } } : { disconnect: true };
    }
    if (input.category !== undefined) data.category = input.category;
    if (input.tags !== undefined) data.tags = { set: input.tags };
    if (input.isPublished !== undefined) {
      data.isPublished = input.isPublished;
      // Si on publie pour la premiere fois, on horodate.
      if (input.isPublished && !existing.publishedAt) data.publishedAt = new Date();
    }
    if (input.markReviewed) data.lastReviewedAt = new Date();
    return this.prisma.kbArticle.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.kbArticle.delete({ where: { id } });
    return { ok: true };
  }

  async markHelpful(id: string) {
    return this.prisma.kbArticle.update({
      where: { id },
      data: { helpfulCount: { increment: 1 } },
      select: { helpfulCount: true },
    });
  }

  // ============================================================
  // Generation depuis ticket : pre-remplit titre/contenu/tags
  // ============================================================
  async draftFromTicket(ticketId: string, userId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        company: { select: { id: true, name: true } },
        messages: {
          where: { isInternal: false, authorId: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket introuvable');
    const lastResponse = ticket.messages[0]?.content ?? '';
    const content = [
      '## Probleme',
      ticket.description || ticket.title,
      '',
      '## Resolution',
      lastResponse || '_(a completer)_',
    ].join('\n');
    return this.create(
      {
        title: ticket.title,
        content,
        category: ticket.category,
        tags: [],
        scope: 'INTERNAL',
        sourceTicketId: ticketId,
        isPublished: false,
      },
      userId,
    );
  }

  // ============================================================
  // Categories existantes (pour datalist UI)
  // ============================================================
  async categories(): Promise<string[]> {
    const rows = await this.prisma.kbArticle.findMany({
      where: { category: { not: null } },
      select: { category: true },
      distinct: ['category'],
    });
    return rows.map((r) => r.category!).filter(Boolean).sort();
  }
}
