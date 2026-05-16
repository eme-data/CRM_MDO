import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateNoteDto } from './dto/create-note.dto';

// MULTI-TENANT : toutes les requetes scopees par tenantId.

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(
    params: {
      companyId?: string;
      contactId?: string;
      opportunityId?: string;
      contractId?: string;
    },
    tenantId: string | null,
  ) {
    const where: Prisma.NoteWhereInput = { tenantId };
    if (params.companyId) where.companyId = params.companyId;
    if (params.contactId) where.contactId = params.contactId;
    if (params.opportunityId) where.opportunityId = params.opportunityId;
    if (params.contractId) where.contractId = params.contractId;
    return this.prisma.note.findMany({
      where,
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(dto: CreateNoteDto, userId: string, tenantId: string | null) {
    return this.prisma.note.create({
      data: { ...dto, authorId: userId, tenantId: tenantId ?? undefined },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async update(id: string, content: string, userId: string, tenantId: string | null) {
    const note = await this.prisma.note.findFirst({ where: { id, tenantId } });
    if (!note) throw new NotFoundException();
    if (note.authorId !== userId) throw new ForbiddenException('Vous ne pouvez editer que vos propres notes');
    return this.prisma.note.update({ where: { id }, data: { content } });
  }

  async remove(id: string, userId: string, userRole: string, tenantId: string | null) {
    const note = await this.prisma.note.findFirst({ where: { id, tenantId } });
    if (!note) throw new NotFoundException();
    if (note.authorId !== userId && userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      throw new ForbiddenException();
    }
    await this.prisma.note.delete({ where: { id } });
    return { success: true };
  }
}
