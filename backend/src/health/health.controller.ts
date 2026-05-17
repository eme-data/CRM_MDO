import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { statfs } from 'fs/promises';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../database/prisma.service';

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
    ]);
    const [db, redis, disk] = results.map((r) =>
      r.status === 'fulfilled' ? r.value : { status: 'ko', error: String(r.reason?.message ?? r.reason) },
    );

    // Status overall : 'down' si DB KO (rien ne marche), 'degraded' si Redis
    // ou disk KO (l'app sert encore mais avec capacite reduite), sinon 'ok'.
    const status =
      db.status === 'ko' ? 'down'
      : (redis.status === 'ko' || disk.status === 'warn' || disk.status === 'ko') ? 'degraded'
      : 'ok';

    const mem = process.memoryUsage();
    return {
      status,
      checks: { db, redis, disk },
      uptime: Math.round(process.uptime()),
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      },
      timestamp: new Date().toISOString(),
    };
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
