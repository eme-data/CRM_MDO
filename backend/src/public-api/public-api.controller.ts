import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ApiKeyGuard } from './api-key.guard';
import { PrismaService } from '../database/prisma.service';

// API publique v1 — authentifiee uniquement par cle API (Bearer mdo_live_...)
// Pas de JWT, pas de session. Endpoints scopés par la cle (CLIENT_* limite
// a la societe associee, GLOBAL_* acces a tout DU TENANT de la cle).
//
// CRITIQUE multi-tenant : le scope GLOBAL_* d'une cle ne donne acces qu'aux
// donnees de SON propre tenant — JAMAIS aux autres tenants. Le helper
// scopedWhere injecte systematiquement key.tenantId.
//
// Tous les endpoints sont @Public pour bypasser le JwtAuthGuard global. Le
// ApiKeyGuard gere l'auth a la place.

@ApiTags('Public API v1')
@Public()
@UseGuards(ApiKeyGuard)
@Controller({ path: 'public/v1', version: '1' })
export class PublicApiController {
  constructor(private readonly prisma: PrismaService) {}

  // Info sur la cle utilisee (utile pour le debug cote client)
  @Get('me')
  me(@Req() req: Request) {
    const k = req.apiKey!;
    return {
      keyId: k.id,
      keyName: k.name,
      scope: k.scope,
      tenantId: k.tenantId,
      company: k.company ?? null,
      expiresAt: k.expiresAt,
    };
  }

  // Liste des contrats accessibles selon le scope
  @Get('contracts')
  contracts(@Req() req: Request) {
    const k = req.apiKey!;
    const where = this.scopedWhere(k);
    return this.prisma.contract.findMany({
      where,
      select: {
        id: true,
        reference: true,
        title: true,
        offer: true,
        status: true,
        startDate: true,
        endDate: true,
        monthlyAmountHt: true,
        company: { select: { id: true, name: true } },
      },
      orderBy: { endDate: 'asc' },
      take: 200,
    });
  }

  @Get('tickets')
  tickets(@Req() req: Request, @Query('status') status?: string) {
    const k = req.apiKey!;
    const where: any = this.scopedWhere(k);
    if (status) where.status = status;
    return this.prisma.ticket.findMany({
      where,
      select: {
        id: true,
        reference: true,
        title: true,
        status: true,
        priority: true,
        category: true,
        createdAt: true,
        resolvedAt: true,
        company: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  @Get('invoices')
  invoices(@Req() req: Request) {
    const k = req.apiKey!;
    const where = this.scopedWhere(k);
    return this.prisma.invoice.findMany({
      where,
      select: {
        id: true,
        number: true,
        status: true,
        issueDate: true,
        dueDate: true,
        totalTtc: true,
        paidAt: true,
        company: { select: { id: true, name: true } },
      },
      orderBy: { issueDate: 'desc' },
      take: 200,
    });
  }

  @Get('assets')
  assets(@Req() req: Request) {
    const k = req.apiKey!;
    const where = this.scopedWhere(k);
    return this.prisma.asset.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        identifier: true,
        vendor: true,
        model: true,
        warrantyUntil: true,
        supportEndDate: true,
        expiresAt: true,
      },
      orderBy: { name: 'asc' },
      take: 500,
    });
  }

  @Get('companies/:id')
  company(@Req() req: Request, @Param('id') id: string) {
    const k = req.apiKey!;
    // CLIENT_*: ne peut consulter que sa propre societe
    if ((k.scope === 'CLIENT_READ' || k.scope === 'CLIENT_WRITE') && k.companyId !== id) {
      throw new ForbiddenException('Hors scope');
    }
    // GLOBAL_*: doit appartenir au meme tenant que la cle.
    return this.prisma.company.findFirst({
      where: { id, ...(k.tenantId ? { tenantId: k.tenantId } : {}) },
      select: {
        id: true, name: true, siret: true, sector: true, status: true,
        address: true, postalCode: true, city: true,
      },
    });
  }

  // Helper : retourne le filtre WHERE Prisma pour scoper aux entites du client
  // ET du tenant de la cle. Critique : sans le filtre tenantId, une cle
  // GLOBAL d'un tenant pourrait lister les contracts/tickets/invoices/assets
  // de TOUS les autres tenants.
  private scopedWhere(k: { scope: string; companyId: string | null; tenantId: string | null }) {
    const tenantFilter = k.tenantId ? { tenantId: k.tenantId } : {};
    if (k.scope === 'CLIENT_READ' || k.scope === 'CLIENT_WRITE') {
      if (!k.companyId) {
        throw new ForbiddenException('Cle CLIENT sans companyId — incoherent');
      }
      return { ...tenantFilter, companyId: k.companyId };
    }
    return tenantFilter;
  }
}
