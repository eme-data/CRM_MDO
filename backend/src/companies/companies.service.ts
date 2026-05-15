import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { QueryCompaniesDto } from './dto/query-companies.dto';
import { buildPageResult, toSkipTake } from '../common/pagination/pagination.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryCompaniesDto) {
    // toSkipTake clamp pageSize a Max 200 (defense en profondeur meme si le
    // DTO le valide deja) et normalise les defauts (page=1, pageSize=25 ici).
    const { skip, take, page, pageSize } = toSkipTake({
      page: query.page,
      pageSize: query.pageSize ?? 25,
    });

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
        skip,
        take,
      }),
      this.prisma.company.count({ where }),
    ]);

    // buildPageResult ajoute pageCount = ceil(total / pageSize) que le frontend
    // utilise pour rendre les controles "Page X / Y" et desactiver Next sur
    // la derniere page.
    return buildPageResult(items, total, page, pageSize);
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
    // Garde-fou : la societe est rattachee a 26 cascades onDelete (contrats,
    // factures, opportunites, time entries...). Un DELETE physique fait perdre
    // tout l'historique financier et d'exploitation. On bloque tant qu'il
    // existe de la donnee structurante. Pour archiver une societe inactive,
    // changer son status en LOST/INACTIVE plutot que de supprimer.
    const [contracts, invoices, opportunities, interventions, tickets] = await Promise.all([
      this.prisma.contract.count({ where: { companyId: id } }),
      this.prisma.invoice.count({ where: { companyId: id } }),
      this.prisma.opportunity.count({ where: { companyId: id } }),
      this.prisma.intervention.count({ where: { companyId: id } }),
      this.prisma.ticket.count({ where: { companyId: id } }),
    ]);
    const blockers: string[] = [];
    if (contracts > 0) blockers.push(`${contracts} contrat(s)`);
    if (invoices > 0) blockers.push(`${invoices} facture(s)`);
    if (opportunities > 0) blockers.push(`${opportunities} opportunite(s)`);
    if (interventions > 0) blockers.push(`${interventions} intervention(s)`);
    if (tickets > 0) blockers.push(`${tickets} ticket(s)`);
    if (blockers.length > 0) {
      throw new BadRequestException(
        `Suppression refusee : la societe est liee a ${blockers.join(', ')}. ` +
        `Pour archiver, changez son statut en LOST plutot que de supprimer.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.activity.create({
        data: { userId, action: 'DELETE', entity: 'Company', entityId: id },
      });
      await tx.company.delete({ where: { id } });
      return { success: true };
    });
  }
}
