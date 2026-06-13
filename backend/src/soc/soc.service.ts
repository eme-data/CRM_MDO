import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

// Console SOC unifiee : agrège les alertes provenant de plusieurs sources
// existantes en une vue normalisee. Pas de nouveau modele DB — on lit
// depuis M365SecurityAlert, UptimeIncident, EmailSecurityCheck < 50,
// ComplianceControlAssessment NON_COMPLIANT CRITICAL/HIGH, et CyberScore bas.

export type AlertSource = 'M365_DEFENDER' | 'UPTIME' | 'EMAIL_SECURITY' | 'COMPLIANCE' | 'ASSET_LIFECYCLE';
export type AlertSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface NormalizedAlert {
  id: string;                  // composite : "<source>:<originalId>"
  source: AlertSource;
  severity: AlertSeverity;
  title: string;
  description: string | null;
  companyId: string | null;
  companyName: string | null;
  occurredAt: Date;
  url: string | null;          // lien interne CRM vers la fiche entite
  status: string | null;       // statut natif de la source si applicable
}

@Injectable()
export class SocService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // Aggregation : tire les alertes "ouvertes" de chaque source et normalise
  // ============================================================
  async listOpen(
    tenantId: string | null,
    params: { companyId?: string; severity?: AlertSeverity; sources?: AlertSource[] } = {},
  ): Promise<NormalizedAlert[]> {
    const sources = params.sources && params.sources.length > 0
      ? params.sources
      : (['M365_DEFENDER', 'UPTIME', 'EMAIL_SECURITY', 'COMPLIANCE', 'ASSET_LIFECYCLE'] as AlertSource[]);

    const tasks: Promise<NormalizedAlert[]>[] = [];
    if (sources.includes('M365_DEFENDER')) tasks.push(this.fromM365(tenantId, params.companyId));
    if (sources.includes('UPTIME')) tasks.push(this.fromUptime(tenantId, params.companyId));
    if (sources.includes('EMAIL_SECURITY')) tasks.push(this.fromEmailSecurity(tenantId, params.companyId));
    if (sources.includes('COMPLIANCE')) tasks.push(this.fromCompliance(tenantId, params.companyId));
    if (sources.includes('ASSET_LIFECYCLE')) tasks.push(this.fromAssetLifecycle(tenantId, params.companyId));

    const all = (await Promise.all(tasks)).flat();
    let filtered = all;
    if (params.severity) filtered = filtered.filter((a) => a.severity === params.severity);

    // Tri : severite desc puis date desc
    const sevOrder: Record<AlertSeverity, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
    filtered.sort((a, b) => {
      const s = sevOrder[b.severity] - sevOrder[a.severity];
      if (s !== 0) return s;
      return b.occurredAt.getTime() - a.occurredAt.getTime();
    });
    return filtered.slice(0, 500);
  }

  async stats(tenantId: string | null) {
    const all = await this.listOpen(tenantId);
    const counts: Record<AlertSeverity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    const bySource: Record<AlertSource, number> = {
      M365_DEFENDER: 0, UPTIME: 0, EMAIL_SECURITY: 0, COMPLIANCE: 0, ASSET_LIFECYCLE: 0,
    };
    for (const a of all) {
      counts[a.severity]++;
      bySource[a.source]++;
    }
    return { total: all.length, counts, bySource };
  }

  // ============================================================
  // Adaptateurs par source — chacun normalise vers NormalizedAlert
  // ============================================================
  private async fromM365(tenantId: string | null, companyId?: string): Promise<NormalizedAlert[]> {
    const rows = await this.prisma.m365SecurityAlert.findMany({
      where: {
        status: { in: ['newAlert', 'inProgress'] },
        // Scope tenant via la relation m365Tenant (porte le tenantId).
        ...(tenantId || companyId
          ? { m365Tenant: { ...(tenantId ? { tenantId } : {}), ...(companyId ? { companyId } : {}) } }
          : {}),
      },
      include: { m365Tenant: { select: { companyId: true, company: { select: { name: true } } } } },
      orderBy: { createdDateTime: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: 'M365_DEFENDER:' + r.id,
      source: 'M365_DEFENDER' as AlertSource,
      severity: this.mapM365Severity(r.severity),
      title: r.title,
      description: r.description,
      companyId: r.m365Tenant.companyId,
      companyName: r.m365Tenant.company?.name ?? null,
      occurredAt: r.createdDateTime,
      url: '/companies/' + r.m365Tenant.companyId,
      status: r.status,
    }));
  }

  private async fromUptime(tenantId: string | null, companyId?: string): Promise<NormalizedAlert[]> {
    const rows = await this.prisma.uptimeIncident.findMany({
      where: {
        endedAt: null,
        // Scope tenant via la relation monitor (UptimeMonitor.tenantId).
        ...(tenantId || companyId
          ? { monitor: { ...(tenantId ? { tenantId } : {}), ...(companyId ? { companyId } : {}) } }
          : {}),
      },
      include: { monitor: { select: { id: true, name: true, companyId: true, company: { select: { name: true } } } } },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: 'UPTIME:' + r.id,
      source: 'UPTIME' as AlertSource,
      severity: 'HIGH' as AlertSeverity,
      title: 'Site DOWN : ' + r.monitor.name,
      description: 'Indisponibilite en cours depuis ' + r.startedAt.toISOString(),
      companyId: r.monitor.companyId,
      companyName: r.monitor.company?.name ?? null,
      occurredAt: r.startedAt,
      url: '/uptime/' + r.monitor.id,
      status: 'OPEN',
    }));
  }

  private async fromEmailSecurity(tenantId: string | null, companyId?: string): Promise<NormalizedAlert[]> {
    const rows = await this.prisma.emailSecurityCheck.findMany({
      where: {
        scorePct: { lt: 50 },
        // EmailSecurityCheck porte tenantId directement.
        ...(tenantId ? { tenantId } : {}),
        ...(companyId ? { companyId } : {}),
      },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { scorePct: 'asc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: 'EMAIL_SECURITY:' + r.id,
      source: 'EMAIL_SECURITY' as AlertSource,
      severity: r.scorePct < 30 ? ('HIGH' as AlertSeverity) : ('MEDIUM' as AlertSeverity),
      title: 'Configuration email faible : ' + r.domain,
      description: 'Score ' + r.scorePct + '/100 — ' +
        (!r.spfRecord ? 'SPF absent · ' : '') +
        (!r.dmarcRecord ? 'DMARC absent · ' : r.dmarcPolicy === 'none' ? 'DMARC p=none · ' : '') +
        (!r.dkimPresent ? 'DKIM non detecte' : ''),
      companyId: r.companyId,
      companyName: r.company?.name ?? null,
      occurredAt: r.lastCheckedAt,
      url: '/email-security',
      status: null,
    }));
  }

  private async fromCompliance(tenantId: string | null, companyId?: string): Promise<NormalizedAlert[]> {
    const rows = await this.prisma.complianceControlAssessment.findMany({
      where: {
        status: 'NON_COMPLIANT',
        control: { criticality: { in: ['CRITICAL', 'HIGH'] } },
        // Scope tenant via la relation assessment (ComplianceAssessment.tenantId).
        ...(tenantId || companyId
          ? { assessment: { ...(tenantId ? { tenantId } : {}), ...(companyId ? { companyId } : {}) } }
          : {}),
      },
      include: {
        control: { select: { code: true, title: true, criticality: true, framework: { select: { code: true } } } },
        assessment: { select: { companyId: true, company: { select: { name: true } } } },
      },
      orderBy: { dueDate: 'asc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: 'COMPLIANCE:' + r.id,
      source: 'COMPLIANCE' as AlertSource,
      severity: r.control.criticality === 'CRITICAL' ? ('CRITICAL' as AlertSeverity) : ('HIGH' as AlertSeverity),
      title: '[' + r.control.framework.code + ' ' + r.control.code + '] ' + r.control.title,
      description: 'Ecart de conformite' + (r.dueDate ? ' — echeance ' + r.dueDate.toISOString().slice(0, 10) : ''),
      companyId: r.assessment.companyId,
      companyName: r.assessment.company?.name ?? null,
      occurredAt: r.updatedAt,
      url: '/compliance/' + r.assessmentId,
      status: 'NON_COMPLIANT',
    }));
  }

  private async fromAssetLifecycle(tenantId: string | null, companyId?: string): Promise<NormalizedAlert[]> {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86400_000);
    // Assets EOSL (supportEndDate < now) ou warranty < 30j
    const rows = await this.prisma.asset.findMany({
      where: {
        type: 'HARDWARE',
        status: 'ACTIVE',
        OR: [
          { supportEndDate: { lt: now } },
          { warrantyUntil: { gte: now, lte: in30 } },
        ],
        // Asset porte tenantId directement.
        ...(tenantId ? { tenantId } : {}),
        ...(companyId ? { companyId } : {}),
      },
      include: { company: { select: { id: true, name: true } } },
      take: 100,
    });
    return rows.map((r) => {
      const isEosl = r.supportEndDate && r.supportEndDate < now;
      return {
        id: 'ASSET_LIFECYCLE:' + r.id,
        source: 'ASSET_LIFECYCLE' as AlertSource,
        severity: isEosl ? ('HIGH' as AlertSeverity) : ('MEDIUM' as AlertSeverity),
        title: (isEosl ? 'EOSL : ' : 'Garantie expire bientot : ') + r.name,
        description: r.vendor + (r.model ? ' / ' + r.model : '') +
          (isEosl ? ' (plus de patches secu)' : ' (garantie ' + r.warrantyUntil!.toISOString().slice(0, 10) + ')'),
        companyId: r.companyId,
        companyName: r.company?.name ?? null,
        occurredAt: r.supportEndDate ?? r.warrantyUntil!,
        url: '/asset-lifecycle',
        status: isEosl ? 'EOSL' : 'WARRANTY_EXPIRING',
      } as NormalizedAlert;
    });
  }

  private mapM365Severity(s: string): AlertSeverity {
    const norm = s.toLowerCase();
    if (norm === 'high') return 'HIGH';
    if (norm === 'medium') return 'MEDIUM';
    if (norm === 'low') return 'LOW';
    if (norm === 'informational' || norm === 'info') return 'INFO';
    return 'MEDIUM';
  }
}
