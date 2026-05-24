import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { statfs, readFile, stat } from 'fs/promises';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../database/prisma.service';

// Cf MetricsService : alimentee par scripts/backup-offsite.sh apres run reussi.
const BACKUP_OFFSITE_HEARTBEAT_FILE = '/app/backups/.offsite-lastrun';
// Warn si > 26h (cron tourne a 4h, donc < 26h = au moins 1 run sur 24h).
const BACKUP_OFFSITE_WARN_AGE_SEC = 26 * 3600;
// KO si > 7j : a ce stade le offsite est clairement casse ou non configure.
const BACKUP_OFFSITE_KO_AGE_SEC = 7 * 24 * 3600;

// Endpoint /health pour monitoring externe (Caddy, UptimeRobot, etc.).
//
// Convention : /health renvoie 200 si l'app est "operationnelle" — DB OK
// (sans BDD on ne peut rien faire). Les dependances optionnelles (Redis,
// disk space) apparaissent dans le payload mais ne degradent pas le statut
// HTTP — un monitoring intelligent regarde le JSON pour des alertes plus
// fines (degraded != down).
//
// Si tu veux qu'un check Redis ou disk space sorte un 503, monitore
// status="down" ou status="degraded" dans le payload depuis Caddy/UptimeRobot.

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    const results = await Promise.allSettled([
      this.checkDb(),
      this.checkRedis(),
      this.checkDisk(),
      this.checkBackupOffsite(),
    ]);
    const [db, redis, disk, backupOffsite] = results.map((r) =>
      r.status === 'fulfilled' ? r.value : { status: 'ko', error: String(r.reason?.message ?? r.reason) },
    );

    // Status overall : 'down' si DB KO (rien ne marche), 'degraded' si Redis
    // ou disk KO (l'app sert encore mais avec capacite reduite), sinon 'ok'.
    // backupOffsite n'impacte pas le status global (un offsite manquant
    // n'empeche pas l'app de servir) — il sert d'alerte JSON pour le
    // monitoring externe (UptimeRobot, Grafana scrapent ce payload).
    const status =
      db.status === 'ko' ? 'down'
      : (redis.status === 'ko' || disk.status === 'warn' || disk.status === 'ko') ? 'degraded'
      : 'ok';

    const mem = process.memoryUsage();
    return {
      status,
      checks: { db, redis, disk, backupOffsite },
      uptime: Math.round(process.uptime()),
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Backup offsite : freshness du heartbeat ecrit par scripts/backup-offsite.sh.
  // 'disabled' si le fichier n'existe pas (= offsite non configure, attendu sur
  // les nouvelles installs avant la mise en place de restic).
  private async checkBackupOffsite(): Promise<{
    status: 'ok' | 'warn' | 'ko' | 'disabled';
    ageSeconds?: number;
    lastRunAt?: string;
  }> {
    try {
      let ts: number | null = null;
      try {
        const content = await readFile(BACKUP_OFFSITE_HEARTBEAT_FILE, 'utf8');
        const parsed = parseInt(content.trim(), 10);
        if (Number.isFinite(parsed) && parsed > 0) ts = parsed;
      } catch {
        // fallback mtime si le fichier existe mais vide / non parsable
      }
      if (ts === null) {
        const st = await stat(BACKUP_OFFSITE_HEARTBEAT_FILE);
        ts = Math.floor(st.mtimeMs / 1000);
      }
      const ageSec = Math.max(0, Math.floor(Date.now() / 1000) - ts);
      const status: 'ok' | 'warn' | 'ko' =
        ageSec > BACKUP_OFFSITE_KO_AGE_SEC ? 'ko'
        : ageSec > BACKUP_OFFSITE_WARN_AGE_SEC ? 'warn'
        : 'ok';
      return {
        status,
        ageSeconds: ageSec,
        lastRunAt: new Date(ts * 1000).toISOString(),
      };
    } catch {
      return { status: 'disabled' };
    }
  }

  private async checkDb(): Promise<{ status: 'ok' | 'ko'; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err: any) {
      return { status: 'ko', error: err.message };
    }
  }

  // Redis : on tape directement sur le port via ioredis sans creer de
  // dependance fixe sur BullMQ (qui peut avoir une queue degradee mais Redis OK).
  private async checkRedis(): Promise<{ status: 'ok' | 'ko'; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      const { default: Redis } = await import('ioredis');
      const client = new Redis({
        host: this.config.get<string>('redis.host') ?? 'redis',
        port: parseInt(this.config.get<string>('redis.port') ?? '6379', 10),
        password: this.config.get<string>('redis.password') || undefined,
        connectTimeout: 2000,
        commandTimeout: 2000,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      try {
        await client.connect();
        const pong = await client.ping();
        return { status: pong === 'PONG' ? 'ok' : 'ko', latencyMs: Date.now() - start };
      } finally {
        client.disconnect();
      }
    } catch (err: any) {
      return { status: 'ko', error: err.message };
    }
  }

  // Disk : warn si <15% libre sur le volume uploads (les backups locaux
  // s'accumulent, et un disque plein empeche tout upload). KO si <5%.
  private async checkDisk(): Promise<{ status: 'ok' | 'warn' | 'ko'; freePct?: number; freeMb?: number }> {
    try {
      const uploadsDir = this.config.get<string>('uploads.dir') ?? '/app/uploads';
      const stats = await statfs(uploadsDir);
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bavail * stats.bsize;
      const freePct = Math.round((freeBytes / totalBytes) * 100);
      const freeMb = Math.round(freeBytes / 1024 / 1024);
      const status = freePct < 5 ? 'ko' : freePct < 15 ? 'warn' : 'ok';
      return { status, freePct, freeMb };
    } catch {
      return { status: 'ko' };
    }
  }
}
