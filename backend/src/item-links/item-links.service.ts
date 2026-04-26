import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const ALLOWED_ENTITIES = new Set([
  'Company',
  'Contact',
  'Contract',
  'Asset',
  'FlexibleAsset',
  'DocPage',
  'SecretEntry',
  'Network',
  'Location',
  'Ticket',
  'Intervention',
]);

export interface CreateLinkDto {
  sourceEntity: string;
  sourceId: string;
  targetEntity: string;
  targetId: string;
  label?: string;
}

@Injectable()
export class ItemLinksService {
  constructor(private readonly prisma: PrismaService) {}

  private validate(entity: string) {
    if (!ALLOWED_ENTITIES.has(entity)) {
      throw new BadRequestException('Entite non supportee : ' + entity);
    }
  }

  // Liste les liens partants ET entrants pour un item donne (vue 360).
  async listForItem(entity: string, id: string) {
    this.validate(entity);
    const out = await this.prisma.itemLink.findMany({
      where: {
        OR: [
          { sourceEntity: entity, sourceId: id },
          { targetEntity: entity, targetId: id },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    // Enrichit chaque lien avec le "petit objet" de l'autre cote (label affiche).
    const enriched = await Promise.all(out.map((l) => this.enrich(l, entity, id)));
    return enriched;
  }

  private async enrich(link: any, focusEntity: string, focusId: string) {
    const isOutgoing = link.sourceEntity === focusEntity && link.sourceId === focusId;
    const otherEntity = isOutgoing ? link.targetEntity : link.sourceEntity;
    const otherId = isOutgoing ? link.targetId : link.sourceId;
    const display = await this.fetchDisplay(otherEntity, otherId);
    return {
      id: link.id,
      direction: isOutgoing ? 'outgoing' : 'incoming',
      label: link.label,
      otherEntity,
      otherId,
      otherLabel: display.label,
      otherSubtitle: display.subtitle,
      createdAt: link.createdAt,
    };
  }

  private async fetchDisplay(entity: string, id: string): Promise<{ label: string; subtitle?: string }> {
    try {
      switch (entity) {
        case 'Company': {
          const c = await this.prisma.company.findUnique({ where: { id }, select: { name: true, city: true } });
          return c ? { label: c.name, subtitle: c.city ?? undefined } : { label: '(supprime)' };
        }
        case 'Contact': {
          const c = await this.prisma.contact.findUnique({ where: { id }, select: { firstName: true, lastName: true, email: true } });
          return c ? { label: c.firstName + ' ' + c.lastName, subtitle: c.email ?? undefined } : { label: '(supprime)' };
        }
        case 'Contract': {
          const c = await this.prisma.contract.findUnique({ where: { id }, select: { reference: true, title: true } });
          return c ? { label: c.reference, subtitle: c.title } : { label: '(supprime)' };
        }
        case 'Asset': {
          const a = await this.prisma.asset.findUnique({ where: { id }, select: { name: true, type: true } });
          return a ? { label: a.name, subtitle: a.type } : { label: '(supprime)' };
        }
        case 'FlexibleAsset': {
          const a = await this.prisma.flexibleAsset.findUnique({
            where: { id },
            select: { name: true, type: { select: { name: true } } },
          });
          return a ? { label: a.name, subtitle: a.type?.name } : { label: '(supprime)' };
        }
        case 'DocPage': {
          const d = await this.prisma.docPage.findUnique({ where: { id }, select: { title: true, category: true } });
          return d ? { label: d.title, subtitle: d.category ?? undefined } : { label: '(supprime)' };
        }
        case 'SecretEntry': {
          const s = await this.prisma.secretEntry.findUnique({ where: { id }, select: { label: true, username: true } });
          return s ? { label: s.label, subtitle: s.username ?? undefined } : { label: '(supprime)' };
        }
        case 'Network': {
          const n = await this.prisma.network.findUnique({ where: { id }, select: { name: true, cidr: true } });
          return n ? { label: n.name, subtitle: n.cidr ?? undefined } : { label: '(supprime)' };
        }
        case 'Location': {
          const l = await this.prisma.location.findUnique({ where: { id }, select: { name: true, city: true } });
          return l ? { label: l.name, subtitle: l.city ?? undefined } : { label: '(supprime)' };
        }
        case 'Ticket': {
          const t = await this.prisma.ticket.findUnique({ where: { id }, select: { reference: true, title: true } });
          return t ? { label: t.reference, subtitle: t.title } : { label: '(supprime)' };
        }
        case 'Intervention': {
          const i = await this.prisma.intervention.findUnique({ where: { id }, select: { title: true, scheduledAt: true } });
          return i ? { label: i.title, subtitle: i.scheduledAt.toISOString().substring(0, 10) } : { label: '(supprime)' };
        }
      }
    } catch {}
    return { label: entity + ' #' + id.substring(0, 8) };
  }

  async create(dto: CreateLinkDto, userId: string) {
    this.validate(dto.sourceEntity);
    this.validate(dto.targetEntity);
    if (dto.sourceEntity === dto.targetEntity && dto.sourceId === dto.targetId) {
      throw new BadRequestException('Un item ne peut pas etre lie a lui-meme');
    }
    return this.prisma.itemLink.upsert({
      where: {
        sourceEntity_sourceId_targetEntity_targetId: {
          sourceEntity: dto.sourceEntity,
          sourceId: dto.sourceId,
          targetEntity: dto.targetEntity,
          targetId: dto.targetId,
        },
      },
      create: { ...dto, createdById: userId },
      update: { label: dto.label },
    });
  }

  async remove(id: string) {
    await this.prisma.itemLink.delete({ where: { id } });
    return { success: true };
  }
}
