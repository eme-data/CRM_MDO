import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { NotificationsService } from '../notifications/notifications.service';
import { JwtUser } from '../common/decorators/current-user.decorator';
import {
  CreateProxmoxClusterDto,
  IngestSnapshotDto,
  ProxmoxResourceDto,
  UpdateProxmoxClusterDto,
} from './dto/proxmox.dto';

// Multi-tenant : toutes les operations cote UI passent par scope.scopedWhere(me).
// L'ingest webhook est authentifie par secret hash compare en timing-safe ;
// pas de tenantId requis sur l'appel (le clusterId + le secret identifient
// le tenant proprietaire — la lookup donne tenantId).

@Injectable()
export class ProxmoxService {
  private readonly logger = new Logger(ProxmoxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
    private readonly notifications: NotificationsService,
  ) {}

  // ============================================================
  // CRUD cluster
  // ============================================================
  list(me: JwtUser, params: { companyId?: string } = {}) {
    return this.prisma.proxmoxCluster.findMany({
      where: this.scope.scopedWhere(me, params.companyId ? { companyId: params.companyId } : {}),
      include: { company: { select: { id: true, name: true } } },
      orderBy: [{ isActive: 'desc' }, { lastPushAt: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, me: JwtUser) {
    const c = await this.prisma.proxmoxCluster.findFirst({
      where: this.scope.scopedWhere(me, { id }),
      include: {
        company: { select: { id: true, name: true, ownerId: true } },
        snapshots: { orderBy: { capturedAt: 'desc' }, take: 1 },
      },
    });
    if (!c) throw new NotFoundException('Cluster Proxmox introuvable');
    return c;
  }

  async create(input: CreateProxmoxClusterDto, me: JwtUser) {
    await this.scope.assertCompanyInTenant(input.companyId, me);
    const company = await this.prisma.company.findUnique({
      where: { id: input.companyId },
      select: { tenantId: true },
    });
    if (!company) throw new NotFoundException('Societe introuvable');

    // Genere un secret affiche UNE FOIS ; on stocke uniquement le hash.
    const plainSecret = 'mdopx_' + randomBytes(24).toString('base64url');
    const secretHash = createHash('sha256').update(plainSecret).digest('hex');

    const created = await this.prisma.proxmoxCluster.create({
      data: {
        tenantId: company.tenantId,
        companyId: input.companyId,
        name: input.name,
        apiUrl: input.apiUrl,
        expectedPushIntervalMin: input.expectedPushIntervalMin ?? 15,
        ingestSecret: secretHash,
      },
    });
    return { ...created, plaintextSecret: plainSecret };
  }

  async update(id: string, input: UpdateProxmoxClusterDto, me: JwtUser) {
    await this.findOne(id, me); // assert tenant ownership
    return this.prisma.proxmoxCluster.update({ where: { id }, data: input });
  }

  async remove(id: string, me: JwtUser) {
    await this.findOne(id, me); // assert tenant ownership
    await this.prisma.proxmoxCluster.delete({ where: { id } });
    return { ok: true };
  }

  async rotateSecret(id: string, me: JwtUser) {
    await this.findOne(id, me); // assert tenant ownership
    const plainSecret = 'mdopx_' + randomBytes(24).toString('base64url');
    const secretHash = createHash('sha256').update(plainSecret).digest('hex');
    await this.prisma.proxmoxCluster.update({
      where: { id },
      data: { ingestSecret: secretHash },
    });
    return { plaintextSecret: plainSecret };
  }

  // ============================================================
  // Ingest webhook (auth par secret en header)
  // ============================================================
  // Comparaison timing-safe pour eviter les attaques par timing sur le hash.
  private timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  // Calcule les agregats normalises a partir du tableau de ressources.
  // Pour les noeuds : cpu (deja 0-1), mem/maxmem -> %.
  // Pour les VMs : on compte running vs total.
  // Pour les storages : disk/maxdisk -> %, on moyenne sur les non-shared
  // (les shared sont comptes une seule fois pour eviter de gonfler la moyenne
  // sur un cluster avec 5 noeuds qui voient le meme stockage NFS).
  private computeAggregates(resources: ProxmoxResourceDto[]): {
    nodeCount: number;
    vmRunning: number;
    vmTotal: number;
    cpuPctAvg: number;
    memPctAvg: number;
    diskPctAvg: number;
  } {
    const nodes = resources.filter((r) => r.type === 'node');
    const vms = resources.filter((r) => r.type === 'qemu' || r.type === 'lxc');
    const realVms = vms.filter((v) => !v.template); // exclut les templates VMID
    const storages = resources.filter((r) => r.type === 'storage');

    // CPU/Mem : moyenne sur les noeuds online (un noeud offline = cpu undefined).
    const onlineNodes = nodes.filter((n) => n.status === 'online' && typeof n.cpu === 'number');
    const cpuPcts = onlineNodes.map((n) => (n.cpu ?? 0) * 100);
    const memPcts = onlineNodes
      .filter((n) => typeof n.mem === 'number' && typeof n.maxmem === 'number' && n.maxmem! > 0)
      .map((n) => ((n.mem ?? 0) / (n.maxmem ?? 1)) * 100);

    // Storage : dedup par id (ex: cephfs partage 1 fois meme si vu sur 3 noeuds).
    // On garde la 1ere occurrence (les valeurs disk/maxdisk sont identiques pour
    // un storage shared, donc choix arbitraire).
    const seenStorage = new Set<string>();
    const uniqueStorages = storages.filter((s) => {
      const key = (s.shared ? 'shared:' : (s.node ?? '') + ':') + (s.id ?? '');
      if (seenStorage.has(key)) return false;
      seenStorage.add(key);
      return true;
    });
    const diskPcts = uniqueStorages
      .filter((s) => typeof s.disk === 'number' && typeof s.maxdisk === 'number' && s.maxdisk! > 0)
      .map((s) => ((s.disk ?? 0) / (s.maxdisk ?? 1)) * 100);

    const avg = (xs: number[]) =>
      xs.length === 0 ? 0 : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100;

    return {
      nodeCount: nodes.length,
      vmRunning: realVms.filter((v) => v.status === 'running').length,
      vmTotal: realVms.length,
      cpuPctAvg: avg(cpuPcts),
      memPctAvg: avg(memPcts),
      diskPctAvg: avg(diskPcts),
    };
  }

  async ingestViaSecret(clusterId: string, secretPlain: string, payload: IngestSnapshotDto) {
    const cluster = await this.prisma.proxmoxCluster.findUnique({ where: { id: clusterId } });
    if (!cluster) throw new NotFoundException('Cluster introuvable');
    if (!cluster.isActive) throw new BadRequestException('Cluster desactive');
    if (!cluster.ingestSecret) throw new BadRequestException('Cluster sans secret d\'ingest');

    const hashIncoming = createHash('sha256').update(secretPlain).digest('hex');
    if (!this.timingSafeEqualHex(hashIncoming, cluster.ingestSecret)) {
      throw new BadRequestException('Secret invalide');
    }
    if (!Array.isArray(payload.resources)) {
      throw new BadRequestException('Champ "resources" requis (tableau).');
    }

    const aggs = this.computeAggregates(payload.resources);
    const capturedAt = payload.capturedAtUnix
      ? new Date(payload.capturedAtUnix * 1000)
      : new Date();

    // Cree le snapshot + update les compteurs miroirs du cluster en une
    // transaction (eviter qu'un dashboard lise mid-update et voit un mix).
    const result = await this.prisma.$transaction([
      this.prisma.proxmoxSnapshot.create({
        data: {
          clusterId,
          capturedAt,
          nodeCount: aggs.nodeCount,
          vmRunning: aggs.vmRunning,
          vmTotal: aggs.vmTotal,
          cpuPctAvg: aggs.cpuPctAvg,
          memPctAvg: aggs.memPctAvg,
          diskPctAvg: aggs.diskPctAvg,
          rawPayload: payload as any,
        },
      }),
      this.prisma.proxmoxCluster.update({
        where: { id: clusterId },
        data: {
          lastPushAt: capturedAt,
          lastNodeCount: aggs.nodeCount,
          lastVmRunning: aggs.vmRunning,
          lastVmTotal: aggs.vmTotal,
          lastCpuPctAvg: aggs.cpuPctAvg,
          lastMemPctAvg: aggs.memPctAvg,
          lastDiskPctAvg: aggs.diskPctAvg,
        },
      }),
    ]);
    return { ok: true, snapshotId: result[0].id, aggregates: aggs };
  }

  // ============================================================
  // Lectures pour dashboard
  // ============================================================
  // Dernier snapshot complet (avec rawPayload pour drill-down nodes/vms).
  async latestSnapshot(clusterId: string, me: JwtUser) {
    await this.findOne(clusterId, me); // assert tenant ownership
    const snap = await this.prisma.proxmoxSnapshot.findFirst({
      where: { clusterId },
      orderBy: { capturedAt: 'desc' },
    });
    if (!snap) throw new NotFoundException('Aucun snapshot pour ce cluster');
    return snap;
  }

  // Serie temporelle des agregats (sans rawPayload pour reduire le volume).
  // Window : '24h' | '7d' | '30d'.
  async timeseries(clusterId: string, window: '24h' | '7d' | '30d', me: JwtUser) {
    await this.findOne(clusterId, me); // assert tenant ownership
    const hours = window === '24h' ? 24 : window === '7d' ? 24 * 7 : 24 * 30;
    const since = new Date(Date.now() - hours * 3600_000);
    return this.prisma.proxmoxSnapshot.findMany({
      where: { clusterId, capturedAt: { gte: since } },
      select: {
        capturedAt: true,
        cpuPctAvg: true,
        memPctAvg: true,
        diskPctAvg: true,
        vmRunning: true,
        vmTotal: true,
      },
      orderBy: { capturedAt: 'asc' },
    });
  }

  // ============================================================
  // CRONS : alertes overdue + cleanup ancien snapshots
  // ============================================================

  // Toutes les heures : detecte les clusters qui n'ont pas push depuis trop
  // longtemps (> 2 * expectedPushIntervalMin) et notifie l'owner. Pattern
  // identique au cron backup overdue (cf backup.service.ts).
  @Cron('5 * * * *', { name: 'proxmox-push-overdue', timeZone: 'Europe/Paris' })
  async runOverdueCheck() {
    try {
      const now = Date.now();
      const clusters = await this.prisma.proxmoxCluster.findMany({
        where: { isActive: true },
        include: { company: { select: { id: true, name: true, ownerId: true } } },
      });
      let alerted = 0;
      for (const c of clusters) {
        const thresholdMs = c.expectedPushIntervalMin * 2 * 60_000;
        const lastPushMs = c.lastPushAt?.getTime() ?? 0;
        if (now - lastPushMs <= thresholdMs) continue;
        const recipientId = c.company.ownerId;
        if (!recipientId) continue;
        try {
          await this.notifications.push({
            userId: recipientId,
            type: 'GENERIC',
            title: 'Proxmox agent silencieux : ' + c.name,
            body:
              'Aucun push depuis ' +
              (c.lastPushAt?.toISOString().slice(0, 16) ?? 'jamais') +
              ' (' + c.company.name + ')',
            entity: 'ProxmoxCluster',
            entityId: c.id,
            url: '/companies/' + c.company.id + '/proxmox',
          });
          alerted++;
        } catch (notifErr: any) {
          this.logger.warn('Proxmox overdue : notif KO pour ' + c.id + ' : ' + notifErr.message);
        }
      }
      if (alerted > 0) this.logger.warn('Proxmox overdue cron : ' + alerted + ' alerte(s)');
    } catch (err: any) {
      this.logger.error('Proxmox overdue cron a echoue : ' + (err?.message ?? err));
    }
  }

  // 04h15 Europe/Paris : purge des snapshots > 90 jours. Sans ca, une instance
  // qui push toutes les 5 min accumule 105 120 rows/an/cluster. La fenetre
  // dashboard la plus longue (30d) reste largement couverte. Configurable
  // via setting plus tard si besoin.
  @Cron('15 4 * * *', { name: 'proxmox-snapshot-cleanup', timeZone: 'Europe/Paris' })
  async runCleanup() {
    try {
      const cutoff = new Date(Date.now() - 90 * 86_400_000);
      const r = await this.prisma.proxmoxSnapshot.deleteMany({
        where: { capturedAt: { lt: cutoff } },
      });
      if (r.count > 0) this.logger.log('Proxmox cleanup : ' + r.count + ' snapshot(s) supprime(s)');
    } catch (err: any) {
      this.logger.error('Proxmox cleanup cron a echoue : ' + (err?.message ?? err));
    }
  }

  // ============================================================
  // Stats globales (dashboard executif tenant)
  // ============================================================
  async stats(me: JwtUser) {
    const clusters = await this.prisma.proxmoxCluster.findMany({
      where: this.scope.scopedWhere(me, { isActive: true }),
      select: {
        lastPushAt: true,
        expectedPushIntervalMin: true,
        lastVmRunning: true,
        lastVmTotal: true,
        lastNodeCount: true,
        lastCpuPctAvg: true,
        lastMemPctAvg: true,
        lastDiskPctAvg: true,
      },
    });
    const now = Date.now();
    let healthy = 0;
    let overdue = 0;
    let neverPushed = 0;
    let totalNodes = 0;
    let totalVmsRunning = 0;
    let totalVmsTotal = 0;
    for (const c of clusters) {
      if (!c.lastPushAt) { neverPushed++; continue; }
      if (now - c.lastPushAt.getTime() > c.expectedPushIntervalMin * 2 * 60_000) overdue++;
      else healthy++;
      totalNodes += c.lastNodeCount ?? 0;
      totalVmsRunning += c.lastVmRunning ?? 0;
      totalVmsTotal += c.lastVmTotal ?? 0;
    }
    return {
      clustersTotal: clusters.length,
      healthy,
      overdue,
      neverPushed,
      totalNodes,
      totalVmsRunning,
      totalVmsTotal,
    };
  }
}
