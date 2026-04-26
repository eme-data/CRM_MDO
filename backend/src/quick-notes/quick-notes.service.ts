import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface UpsertQuickNoteDto {
  companyId: string;
  content: string;
  color?: string;
  pinned?: boolean;
}

@Injectable()
export class QuickNotesService {
  constructor(private readonly prisma: PrismaService) {}

  listForCompany(companyId: string) {
    return this.prisma.quickNote.findMany({
      where: { companyId },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  create(dto: UpsertQuickNoteDto, userId: string) {
    return this.prisma.quickNote.create({
      data: {
        companyId: dto.companyId,
        content: dto.content,
        color: dto.color,
        pinned: dto.pinned ?? true,
        authorId: userId,
      },
    });
  }

  async update(id: string, dto: Partial<UpsertQuickNoteDto>) {
    const existing = await this.prisma.quickNote.findUnique({ where: { id } });
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

  async remove(id: string) {
    await this.prisma.quickNote.delete({ where: { id } });
    return { success: true };
  }
}
