import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { QueryCompaniesDto } from './dto/query-companies.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryCompaniesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.CompanyWhereInput = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
        { siret: { contains: query.search } },
      ];
    }
    if (query.status) where.status = query.status;
    if (query.sector) where.sector = query.sector;
    if (query.ownerId) where.ownerId = query.ownerId;

    const [items, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { contacts: true, contracts: true, opportunities: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.company.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        contacts: { orderBy: { isPrimary: 'desc' } },
        contracts: { orderBy: { endDate: 'asc' } },
        opportunities: { orderBy: { updatedAt: 'desc' } },
        interventions: { orderBy: { scheduledAt: 'desc' }, take: 10 },
      },
    });
    if (!company) throw new NotFoundException('Societe introuvable');
    return company;
  }

  create(dto: CreateCompanyDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { ...dto, ownerId: dto.ownerId ?? userId },
      });
      await tx.activity.create({
        data: {
          userId,
          action: 'CREATE',
          entity: 'Company',
          entityId: company.id,
          metadata: { name: company.name },
        },
      });
      return company;
    });
  }

  async update(id: string, dto: UpdateCompanyDto, userId: string) {
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({ where: { id }, data: dto });
      await tx.activity.create({
        data: { userId, action: 'UPDATE', entity: 'Company', entityId: id, metadata: dto as any },
      });
      return updated;
    });
  }

  async remove(id: string, userId: string) {
    await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.activity.create({
        data: { userId, action: 'DELETE', entity: 'Company', entityId: id },
      });
      await tx.company.delete({ where: { id } });
      return { success: true };
    });
  }
}
