import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { M365GraphClient } from '../m365/m365-graph.client';

@Injectable()
export class PatchManagementService {
  private readonly logger = new Logger(PatchManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly graph: M365GraphClient,
  ) {}

  // ============================================================
  // Sync devices d'un tenant via Graph API Intune
  // ============================================================
  async syncTenant(tenantId: string) {
    const tenant = await this.prisma.m365Tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant introuvable');

    const clientId = await this.settings.get('m365.clientId');
    const clientSecret = await this.settings.get('m365.clientSecret');
    if (!clientId || !clientSecret) {
      throw new Error('M365 clientId/clientSecret non configures');
    }

    const token = await this.graph.getAccessToken(tenant.tenantId, clientId, clientSecret);
    // GET /deviceManagement/managedDevices : Intune managed devices
    // Permission requise : DeviceManagementManagedDevices.Read.All
    const devices = await this.graph.getAll<any>(token, '/deviceManagement/managedDevices');

    let upserted = 0;
    for (const d of devices) {
      try {
        await this.prisma.patchManagedDevice.upsert({
          where: { m365TenantId_externalId: { m365TenantId: tenant.id, externalId: d.id } },
          create: {
            m365TenantId: tenant.id,
            externalId: d.id,
            deviceName: d.deviceName ?? '(sans nom)',
            operatingSystem: d.operatingSystem ?? null,
            osVersion: d.osVersion ?? null,
            complianceState: d.complianceState ?? null,
            managementAgent: d.managementAgent ?? null,
            lastSyncDateTime: d.lastSyncDateTime ? new Date(d.lastSyncDateTime) : null,
            enrolledDateTime: d.enrolledDateTime ? new Date(d.enrolledDateTime) : null,
            isEncrypted: !!d.isEncrypted,
            isSupervised: !!d.isSupervised,
            userPrincipalName: d.userPrincipalName ?? null,
            serialNumber: d.serialNumber ?? null,
            manufacturer: d.manufacturer ?? null,
            model: d.model ?? null,
          },
          update: {
            deviceName: d.deviceName ?? '(sans nom)',
            operatingSystem: d.operatingSystem ?? null,
            osVersion: d.osVersion ?? null,
            complianceState: d.complianceState ?? null,
            managementAgent: d.managementAgent ?? null,
            lastSyncDateTime: d.lastSyncDateTime ? new Date(d.lastSyncDateTime) : null,
            isEncrypted: !!d.isEncrypted,
            isSupervised: !!d.isSupervised,
            userPrincipalName: d.userPrincipalName ?? null,
            serialNumber: d.serialNumber ?? null,
            manufacturer: d.manufacturer ?? null,
            model: d.model ?? null,
            syncedAt: new Date(),
          },
        });
        upserted++;
      } catch (err: any) {
        this.logger.warn('PatchDevice sync failed for ' + d.id + ' : ' + err.message);
      }
    }
    this.logger.log('Patch sync tenant ' + tenant.id + ' : ' + upserted + ' device(s)');
    return { upserted };
  }

  // Cron quotidien 04:30 (apres backups, avant rapport mensuel)
  @Cron('30 4 * * *', { name: 'patch-management-sync', timeZone: 'Europe/Paris' })
  async runDailySync() {
    const tenants = await this.prisma.m365Tenant.findMany({ select: { id: true } });
    let ok = 0, failed = 0;
    for (const t of tenants) {
      try { await this.syncTenant(t.id); ok++; }
      catch (err: any) { failed++; this.logger.warn('Sync tenant ' + t.id + ' echec : ' + err.message); }
    }
    this.logger.log('Patch sync daily : ' + ok + ' OK, ' + failed + ' echecs');
  }

  // ============================================================
  // Listing
  // ============================================================
  async list(params: { companyId?: string; complianceState?: string } = {}) {
    const where: Prisma.PatchManagedDeviceWhereInput = {};
    if (params.companyId) where.m365Tenant = { companyId: params.companyId };
    if (params.complianceState) where.complianceState = params.complianceState;
    return this.prisma.patchManagedDevice.findMany({
      where,
      include: {
        m365Tenant: { select: { companyId: true, company: { select: { id: true, name: true } } } },
      },
      orderBy: [{ complianceState: 'asc' }, { lastSyncDateTime: 'desc' }],
      take: 500,
    });
  }

  async stats() {
    const all = await this.prisma.patchManagedDevice.findMany({
      select: { complianceState: true, isEncrypted: true, lastSyncDateTime: true, operatingSystem: true },
    });
    const byCompliance = new Map<string, number>();
    const byOs = new Map<string, number>();
    let encrypted = 0;
    let staleSync = 0;
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
    for (const d of all) {
      const k = d.complianceState ?? 'unknown';
      byCompliance.set(k, (byCompliance.get(k) ?? 0) + 1);
      const os = d.operatingSystem ?? 'unknown';
      byOs.set(os, (byOs.get(os) ?? 0) + 1);
      if (d.isEncrypted) encrypted++;
      if (!d.lastSyncDateTime || d.lastSyncDateTime < sevenDaysAgo) staleSync++;
    }
    return {
      total: all.length,
      encryptedPct: all.length > 0 ? Math.round((encrypted / all.length) * 100) : 0,
      staleSyncCount: staleSync,
      byCompliance: Array.from(byCompliance.entries()).map(([state, count]) => ({ state, count })),
      byOs: Array.from(byOs.entries()).map(([os, count]) => ({ os, count })),
    };
  }
}
