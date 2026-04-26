import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface Hit {
  type: 'company' | 'contact' | 'opportunity' | 'contract' | 'ticket';
  id: string;
  title: string;
  subtitle?: string;
  url: string;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async global(q: string, limit = 20): Promise<Hit[]> {
    if (!q || q.trim().length < 2) return [];
    const term = q.trim();

    const [companies, contacts, opps, contracts, tickets] = await Promise.all([
      this.prisma.company.findMany({
        where: {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            { city: { contains: term, mode: 'insensitive' } },
            { siret: { contains: term } },
            { siren: { contains: term } },
          ],
        },
        select: { id: true, name: true, city: true, status: true },
        take: limit,
      }),
      this.prisma.contact.findMany({
        where: {
          OR: [
            { firstName: { contains: term, mode: 'insensitive' } },
            { lastName: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true, firstName: true, lastName: true, email: true,
          company: { select: { name: true } },
        },
        take: limit,
      }),
      this.prisma.opportunity.findMany({
        where: {
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, title: true, stage: true, company: { select: { name: true } } },
        take: limit,
      }),
      this.prisma.contract.findMany({
        where: {
          OR: [
            { reference: { contains: term, mode: 'insensitive' } },
            { title: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, reference: true, title: true, company: { select: { name: true } } },
        take: limit,
      }),
      this.prisma.ticket.findMany({
        where: {
          OR: [
            { reference: { contains: term, mode: 'insensitive' } },
            { title: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        },
        select: { id: true, reference: true, title: true, status: true, company: { select: { name: true } } },
        take: limit,
      }),
    ]);

    const hits: Hit[] = [
      ...companies.map((c) => ({
        type: 'company' as const, id: c.id, title: c.name,
        subtitle: [c.city, c.status].filter(Boolean).join(' - '),
        url: '/companies/' + c.id,
      })),
      ...contacts.map((c) => ({
        type: 'contact' as const, id: c.id,
        title: c.firstName + ' ' + c.lastName,
        subtitle: [c.company?.name, c.email].filter(Boolean).join(' - '),
        url: '/contacts/' + c.id,
      })),
      ...opps.map((o) => ({
        type: 'opportunity' as const, id: o.id, title: o.title,
        subtitle: o.company.name + ' - ' + o.stage,
        url: '/opportunities/' + o.id,
      })),
      ...contracts.map((c) => ({
        type: 'contract' as const, id: c.id,
        title: c.reference + ' - ' + c.title,
        subtitle: c.company.name,
        url: '/contracts/' + c.id,
      })),
      ...tickets.map((t) => ({
        type: 'ticket' as const, id: t.id,
        title: t.reference + ' - ' + t.title,
        subtitle: t.company.name + ' - ' + t.status,
        url: '/tickets/' + t.id,
      })),
    ];
    return hits.slice(0, limit);
  }
}
