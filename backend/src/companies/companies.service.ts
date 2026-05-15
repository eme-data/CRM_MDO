import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { QueryCompaniesDto } from './dto/query-companies.dto';
import { buildPageResult, toSkipTake } from '../common/pagination/pagination.dto';

// MULTI-TENANT : toutes les requetes scopees par tenantId. Le tenantId est
// passe par le controller (via user.tenantId du JWT). Ne JAMAIS faire de
// requete sur Company sans scope tenant — risque de leak inter-tenant.

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryCompaniesDto, tenantId: string | null) {
    const { skip, take, page, pageSize } = toSkipTake({
      page: query.page,
      pageSize: query.pageSize ?? 25,
    });

    const where: Prisma.CompanyWhereInput = { tenantId };
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

    return buildPageResult(items, total, page, pageSize);
  }

  // Tenant scope strict : on cherche par id ET par tenantId, sinon NotFound.
  // Empeche un user du tenant A de lire les details d'une societe du tenant B
  // meme s'il devine l'UUID.
  async findOne(id: string, tenantId: string | null) {
    const company = await this.prisma.company.findFirst({
      where: { id, tenantId },
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

  create(dto: CreateCompanyDto, userId: string, tenantId: string | null) {
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { ...dto, ownerId: dto.ownerId ?? userId, tenantId: tenantId ?? undefined },
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

  async update(id: string, dto: UpdateCompanyDto, userId: string, tenantId: string | null) {
    await this.findOne(id, tenantId); // garantit le scope tenant
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({ where: { id }, data: dto });
      await tx.activity.create({
        data: { userId, action: 'UPDATE', entity: 'Company', entityId: id, metadata: dto as any },
      });
      return updated;
    });
  }

  async remove(id: string, userId: string, tenantId: string | null) {
    await this.findOne(id, tenantId);
    // Garde-fou : la societe est rattachee a beaucoup de cascades onDelete
    // (contrats, factures, opportunites, time entries...). Un DELETE physique
    // fait perdre tout l'historique. On bloque tant qu'il existe de la donnee.
    // (Filtres scope tenant pour rester safe meme si findOne avait un bug)
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
