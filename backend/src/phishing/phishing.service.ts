import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PhishingCampaignStatus, PhishingVendor, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

// CSV import : on accepte un format simple
//   email,name,opened,clicked,reportedAsPhish,dataEntered,openedAt,clickedAt
// Tolerant aux booleens "true/1/yes/x" et aux dates ISO ou vides.

function parseBool(v: any): boolean {
  if (v === true || v === 1) return true;
  if (typeof v !== 'string') return false;
  const s = v.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'oui' || s === 'x';
}

function parseDate(v: any): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class PhishingService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // Campagnes
  // ============================================================
  list(params: { companyId?: string; status?: PhishingCampaignStatus } = {}) {
    return this.prisma.phishingCampaign.findMany({
      where: {
        ...(params.companyId ? { companyId: params.companyId } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      include: {
        company: { select: { id: true, name: true } },
        _count: { select: { results: true } },
      },
      orderBy: { sentAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const c = await this.prisma.phishingCampaign.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        results: { orderBy: { userEmail: 'asc' } },
      },
    });
    if (!c) throw new NotFoundException('Campagne introuvable');
    return c;
  }

  async create(input: {
    name: string;
    vendor?: PhishingVendor;
    companyId: string;
    sentAt?: string;
    templateName?: string;
    notes?: string;
    externalId?: string;
  }) {
    return this.prisma.phishingCampaign.create({
      data: {
        name: input.name,
        vendor: input.vendor ?? 'GOPHISH',
        companyId: input.companyId,
        sentAt: input.sentAt ? new Date(input.sentAt) : null,
        status: input.sentAt ? 'RUNNING' : 'DRAFT',
        templateName: input.templateName,
        notes: input.notes,
        externalId: input.externalId,
      },
    });
  }

  async update(id: string, input: Partial<{
    name: string;
    status: PhishingCampaignStatus;
    sentAt: string | null;
    completedAt: string | null;
    templateName: string | null;
    notes: string | null;
  }>) {
    await this.findOne(id);
    const data: Prisma.PhishingCampaignUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.status !== undefined) data.status = input.status;
    if (input.sentAt !== undefined) data.sentAt = input.sentAt ? new Date(input.sentAt) : null;
    if (input.completedAt !== undefined) data.completedAt = input.completedAt ? new Date(input.completedAt) : null;
    if (input.templateName !== undefined) data.templateName = input.templateName;
    if (input.notes !== undefined) data.notes = input.notes;
    return this.prisma.phishingCampaign.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.phishingCampaign.delete({ where: { id } });
    return { ok: true };
  }

  // ============================================================
  // Import resultats (bulk upsert + recompute compteurs)
  // ============================================================
  async importResults(campaignId: string, rows: Array<{
    email: string;
    name?: string;
    opened?: any;
    clicked?: any;
    reportedAsPhish?: any;
    dataEntered?: any;
    openedAt?: any;
    clickedAt?: any;
    reportedAt?: any;
    dataEnteredAt?: any;
  }>) {
    await this.findOne(campaignId);
    if (rows.length === 0) throw new BadRequestException('Aucune ligne a importer');
    let imported = 0;
    for (const r of rows) {
      if (!r.email) continue;
      await this.prisma.phishingResult.upsert({
        where: { campaignId_userEmail: { campaignId, userEmail: r.email.toLowerCase().trim() } },
        create: {
          campaignId,
          userEmail: r.email.toLowerCase().trim(),
          userName: r.name,
          opened: parseBool(r.opened),
          clicked: parseBool(r.clicked),
          reportedAsPhish: parseBool(r.reportedAsPhish),
          dataEntered: parseBool(r.dataEntered),
          openedAt: parseDate(r.openedAt),
          clickedAt: parseDate(r.clickedAt),
          reportedAt: parseDate(r.reportedAt),
          dataEnteredAt: parseDate(r.dataEnteredAt),
        },
        update: {
          userName: r.name,
          opened: parseBool(r.opened),
          clicked: parseBool(r.clicked),
          reportedAsPhish: parseBool(r.reportedAsPhish),
          dataEntered: parseBool(r.dataEntered),
          openedAt: parseDate(r.openedAt),
          clickedAt: parseDate(r.clickedAt),
          reportedAt: parseDate(r.reportedAt),
          dataEnteredAt: parseDate(r.dataEnteredAt),
        },
      });
      imported++;
    }
    await this.recomputeCounters(campaignId);
    return { imported };
  }

  private async recomputeCounters(campaignId: string) {
    const results = await this.prisma.phishingResult.findMany({
      where: { campaignId },
      select: { opened: true, clicked: true, reportedAsPhish: true, dataEntered: true },
    });
    await this.prisma.phishingCampaign.update({
      where: { id: campaignId },
      data: {
        totalRecipients: results.length,
        openedCount: results.filter((r) => r.opened).length,
        clickedCount: results.filter((r) => r.clicked).length,
        reportedCount: results.filter((r) => r.reportedAsPhish).length,
        dataEnteredCount: results.filter((r) => r.dataEntered).length,
      },
    });
  }

  // ============================================================
  // Stats par client : top utilisateurs failli (a former en priorite)
  // ============================================================
  async topRiskyUsers(companyId: string, limit = 20) {
    const results = await this.prisma.phishingResult.findMany({
      where: { campaign: { companyId } },
      select: { userEmail: true, userName: true, clicked: true, dataEntered: true, reportedAsPhish: true },
    });
    const byUser = new Map<string, { email: string; name: string | null; clicks: number; dataEntered: number; reports: number; campaigns: number }>();
    for (const r of results) {
      const u = byUser.get(r.userEmail) ?? { email: r.userEmail, name: r.userName, clicks: 0, dataEntered: 0, reports: 0, campaigns: 0 };
      if (r.clicked) u.clicks++;
      if (r.dataEntered) u.dataEntered++;
      if (r.reportedAsPhish) u.reports++;
      u.campaigns++;
      byUser.set(r.userEmail, u);
    }
    return Array.from(byUser.values())
      // Score risque : dataEntered=10pts, clicked=3pts, reported=-1pts
      .map((u) => ({ ...u, riskScore: u.dataEntered * 10 + u.clicks * 3 - u.reports }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, limit);
  }
}
