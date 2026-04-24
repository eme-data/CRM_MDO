import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { search?: string; companyId?: string; page?: number; pageSize?: number }) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 50;
    const where: Prisma.ContactWhereInput = {};
    if (params.companyId) where.companyId = params.companyId;
    if (params.search) {
      where.OR = [
        { firstName: { contains: params.search, mode: 'insensitive' } },
        { lastName: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        include: { company: { select: { id: true, name: true } } },
        orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contact.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: { company: true, owner: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!contact) throw new NotFoundException('Contact introuvable');
    return contact;
  }

  async create(dto: CreateContactDto, userId: string) {
    const contact = await this.prisma.contact.create({
      data: { ...dto, ownerId: dto.ownerId ?? userId },
    });
    await this.prisma.activity.create({
      data: { userId, action: 'CREATE', entity: 'Contact', entityId: contact.id },
    });
    return contact;
  }

  async update(id: string, dto: UpdateContactDto, userId: string) {
    await this.findOne(id);
    const updated = await this.prisma.contact.update({ where: { id }, data: dto });
    await this.prisma.activity.create({
      data: { userId, action: 'UPDATE', entity: 'Contact', entityId: id },
    });
    return updated;
  }

  async remove(id: string, userId: string) {
    await this.findOne(id);
    await this.prisma.contact.delete({ where: { id } });
    await this.prisma.activity.create({
      data: { userId, action: 'DELETE', entity: 'Contact', entityId: id },
    });
    return { success: true };
  }
}
