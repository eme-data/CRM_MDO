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

  async update(id: string, dto: Partial<CreateDocPageDto>) {
    await this.findOne(id);
    return this.prisma.docPage.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.docPage.delete({ where: { id } });
    return { success: true };
  }
}
