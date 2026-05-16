import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
  ) {}

  private validate(entity: string) {
    if (!ALLOWED_ENTITIES.has(entity)) {
      throw new BadRequestException('Entite non supportee : ' + entity);
    }
  }

  // Verifie que (entity, id) appartient au tenant de l'utilisateur. Throw 404
  // sinon (pas de revelation cross-tenant). Renvoie le tenantId de l'entite
  // pour usage en aval. Super-admin bypasse.
  private async assertEntityInTenant(entity: string, id: string, me: JwtUser): Promise<string | null> {
    if (me.isSuperAdmin) {
      const t = await this.fetchTenantId(entity, id);
      if (t === undefined) throw new NotFoundException();
      return t;
    }
    const tenantId = await this.fetchTenantId(entity, id);
    if (tenantId === undefined) throw new NotFoundException();
    if (tenantId !== me.tenantId) throw new NotFoundException();
    return tenantId;
  }

  // Charge le tenantId d'une entite. Renvoie undefined si introuvable.
  private async fetchTenantId(entity: string, id: string): Promise<string | null | undefined> {
    switch (entity) {
      case 'Company': {
        const r = await this.prisma.company.findUnique({ where: { id }, select: { tenantId: true } });
        return r?.tenantId ?? undefined;
      }
      case 'Contact': {
        const r = await this.prisma.contact.findUnique({ where: { id }, select: { tenantId: true } });
        return r?.tenantId ?? undefined;
      }
      case 'Contract': {
        const r = await this.prisma.contract.findUnique({ where: { id }, select: { tenantId: true } });
        return r?.tenantId ?? undefined;
      }
      case 'Asset': {
        const r = await this.prisma.asset.findUnique({ where: { id }, select: { tenantId: true } });
        return r?.tenantId ?? undefined;
      }
      case 'FlexibleAsset': {
        const r = await this.prisma.flexibleAsset.findUnique({ where: { id }, select: { tenantId: true } });
        return r?.tenantId ?? undefined;
      }
      case 'DocPage': {
        const r = await this.prisma.docPage.findUnique({ where: { id }, select: { tenantId: true } });
        return r?.tenantId ?? undefined;
      }
      case 'SecretEntry': {
        const r = await this.prisma.secretEntry.findUnique({ where: { id }, select: { tenantId: true } });
        return r?.tenantId ?? undefined;
      }
      case 'Network': {
        const r = await this.prisma.network.findUnique({ where: { id }, select: { tenantId: true } });
        return r?.tenantId ?? undefined;
      }
      case 'Location': {
        const r = await this.prisma.location.findUnique({ where: { id }, select: { tenantId: true } });
        return r?.tenantId ?? undefined;
      }
      case 'Ticket': {
        const r = await this.prisma.ticket.findUnique({ where: { id }, select: { tenantId: true } });
        return r?.tenantId ?? undefined;
      }
      case 'Intervention': {
        const r = await this.prisma.intervention.findUnique({ where: { id }, select: { tenantId: true } });
        return r?.tenantId ?? undefined;
      }
    }
    return undefined;
  }

  // Liste les liens partants ET entrants pour un item donne (vue 360).
  // Multi-tenant : on valide que l'item focus appartient au tenant courant
  // avant de retourner ses liens. Sans ca, un user pourrait deviner un id
  // d'asset d'un autre tenant et lister tous ses liens.
  async listForItem(entity: string, id: string, me: JwtUser) {
    this.validate(entity);
    await this.assertEntityInTenant(entity, id, me);
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
    const enriched = await Promise.all(out.map((l) => this.enrich(l, entity, id, me)));
    return enriched;
  }

  private async enrich(link: any, focusEntity: string, focusId: string, me: JwtUser) {
    const isOutgoing = link.sourceEntity === focusEntity && link.sourceId === focusId;
    const otherEntity = isOutgoing ? link.targetEntity : link.sourceEntity;
    const otherId = isOutgoing ? link.targetId : link.sourceId;
    const display = await this.fetchDisplay(otherEntity, otherId, me);
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

  // Fetch le label d'une entite ; si elle existe mais appartient a un autre
  // tenant, on renvoie "(autre tenant)" plutot que de leaker le label. Si
  // supprimee, "(supprime)".
  private async fetchDisplay(entity: string, id: string, me: JwtUser): Promise<{ label: string; subtitle?: string }> {
    try {
      const tenantId = await this.fetchTenantId(entity, id);
      if (tenantId === undefined) return { label: '(supprime)' };
      if (!me.isSuperAdmin && tenantId !== me.tenantId) return { label: '(autre tenant)' };
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

  // Cree un lien : verifie que SOURCE et TARGET appartiennent au meme tenant
  // que l'utilisateur (sinon on pourrait creer un lien cross-tenant).
  async create(dto: CreateLinkDto, me: JwtUser) {
    this.validate(dto.sourceEntity);
    this.validate(dto.targetEntity);
    if (dto.sourceEntity === dto.targetEntity && dto.sourceId === dto.targetId) {
      throw new BadRequestException('Un item ne peut pas etre lie a lui-meme');
    }
    await this.assertEntityInTenant(dto.sourceEntity, dto.sourceId, me);
    await this.assertEntityInTenant(dto.targetEntity, dto.targetId, me);
    return this.prisma.itemLink.upsert({
      where: {
        sourceEntity_sourceId_targetEntity_targetId: {
          sourceEntity: dto.sourceEntity,
          sourceId: dto.sourceId,
          targetEntity: dto.targetEntity,
          targetId: dto.targetId,
        },
      },
      create: { ...dto, createdById: me.id },
      update: { label: dto.label },
    });
  }

  // Suppression : on verifie que l'utilisateur a acces a au moins l'un des
  // deux endpoints du lien (sinon il pourrait casser un lien d'un autre tenant).
  async remove(id: string, me: JwtUser) {
    const link = await this.prisma.itemLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException();
    if (!me.isSuperAdmin) {
      const sourceTenant = await this.fetchTenantId(link.sourceEntity, link.sourceId);
      const targetTenant = await this.fetchTenantId(link.targetEntity, link.targetId);
      const ok = sourceTenant === me.tenantId || targetTenant === me.tenantId;
      if (!ok) throw new NotFoundException();
    }
    await this.prisma.itemLink.delete({ where: { id } });
    return { success: true };
  }
}
