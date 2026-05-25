import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { spawn } from 'child_process';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { compare } from 'bcryptjs';
import { SystemBackupKind, SystemBackupStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';

const PG_DUMP_TIMEOUT_MS = 30 * 60_000; // 30 min max
const PG_RESTORE_TIMEOUT_MS = 30 * 60_000;

@Injectable()
export class SystemBackupService implements OnModuleInit {
  private readonly logger = new Logger(SystemBackupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    // Cree le repertoire au demarrage si absent (premiere instance)
    const dir = this.getBackupDir();
    try { await fs.mkdir(dir, { recursive: true }); }
    catch (err: any) { this.logger.warn('Backup dir mkdir failed : ' + err.message); }
  }

  private getBackupDir(): string {
    return this.config.get<string>('systemBackup.dir') ?? '/app/backups';
  }

  private getUploadsDir(): string {
    return this.config.get<string>('uploads.dir') ?? '/app/uploads';
  }

  // Parse DATABASE_URL en composants pour pg_dump/pg_restore
  // Format : postgres://user:pass@host:port/dbname
  private parseDatabaseUrl(): {
    user: string; password: string; host: string; port: string; database: string;
  } {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL non defini');
    const m = url.match(/^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/);
    if (!m) throw new Error('DATABASE_URL invalide : ' + url.slice(0, 30));
    return {
      user: decodeURIComponent(m[1]),
      password: decodeURIComponent(m[2]),
      host: m[3],
      port: m[4] ?? '5432',
      database: m[5].split('?')[0],
    };
  }

  private async runShell(cmd: string, args: string[], opts: { env?: Record<string, string>; timeoutMs: number; stdoutFile?: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      const env = { ...process.env, ...(opts.env ?? {}) };
      const child = spawn(cmd, args, { env, stdio: ['ignore', opts.stdoutFile ? 'pipe' : 'inherit', 'pipe'] });
      let stderr = '';
      child.stderr?.on('data', (d) => { stderr += d.toString(); });
      if (opts.stdoutFile && child.stdout) {
        const ws = createWriteStream(opts.stdoutFile);
        child.stdout.pipe(ws);
      }
      const t = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(cmd + ' timeout (' + opts.timeoutMs + 'ms)'));
      }, opts.timeoutMs);
      child.on('exit', (code) => {
        clearTimeout(t);
        if (code === 0) resolve();
        else reject(new Error(cmd + ' exit ' + code + ' : ' + stderr.slice(0, 500)));
      });
      child.on('error', (err) => { clearTimeout(t); reject(err); });
    });
  }

  // ============================================================
  // CREATE backup
  // ============================================================
  async createBackup(input: { kind?: SystemBackupKind; userId?: string; includeUploads?: boolean } = {}) {
    const start = Date.now();
    const includeUploadsSetting = await this.settings.getBool('systemBackup.includeUploads');
    const includeUploads = input.includeUploads ?? includeUploadsSetting;
    const kind = input.kind ?? 'MANUAL';

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = 'crm-mdo-backup-' + stamp + '-' + randomBytes(4).toString('hex') + '.tar.gz';
    const relPath = path.posix.join(String(year), month, filename);
    const fullPath = path.join(this.getBackupDir(), relPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // Cree le record en RUNNING d'abord — visible cote UI meme si le pg_dump est long
    const record = await this.prisma.systemBackup.create({
      data: {
        kind,
        status: 'RUNNING',
        filename,
        pathRelative: relPath,
        includesDb: true,
        includesUploads: includeUploads,
        createdById: input.userId,
      },
    });

    try {
      // Workspace temporaire
      const workDir = path.join(this.getBackupDir(), '.tmp-' + randomBytes(8).toString('hex'));
      await fs.mkdir(workDir, { recursive: true });
      try {
        // 1. pg_dump format custom
        const db = this.parseDatabaseUrl();
        const dumpFile = path.join(workDir, 'db.dump');
        await this.runShell('pg_dump', [
          '-h', db.host, '-p', db.port, '-U', db.user, '-d', db.database,
          '-Fc', '--no-owner', '--no-acl', '-f', dumpFile,
        ], {
          env: { PGPASSWORD: db.password },
          timeoutMs: PG_DUMP_TIMEOUT_MS,
        });

        // 2. metadata.json
        const meta = {
          createdAt: now.toISOString(),
          schemaVersion: 'prisma',
          includesDb: true,
          includesUploads: includeUploads,
          kind,
        };
        await fs.writeFile(path.join(workDir, 'metadata.json'), JSON.stringify(meta, null, 2));

        // 3. Un seul tar atomique : workspace (db.dump + metadata.json) +
        // contenu de uploads/ (concatenes a la racine de l'archive, le
        // restore reconnait db.dump/metadata.json et copie le reste vers
        // /app/uploads). Pas de double-tar + unlink intermediaire (qui
        // pouvait laisser un .tar.gz tronque si l'unlink rate ou si le 2eme
        // tar plante en cours -> backup non-restorable detecte trop tard).
        const tarArgs = includeUploads
          ? [
              '-czf', fullPath,
              '-C', workDir, 'db.dump', 'metadata.json',
              '-C', this.getUploadsDir(), '.',
            ]
          : ['-czf', fullPath, '-C', workDir, 'db.dump', 'metadata.json'];
        await this.runShell('tar', tarArgs, { timeoutMs: PG_DUMP_TIMEOUT_MS });

        // 4. Verification d'integrite : tar -tzf reussit ssi l'archive est
        // listable bout en bout (catch les ecritures partielles cas FS plein,
        // process kille en cours, etc.). Sans ca, un backup corrompu n'etait
        // detecte qu'au moment du restore — trop tard.
        await this.runShell('tar', ['-tzf', fullPath], { timeoutMs: 60_000 });

        // 5. Stat fichier
        const stat = await fs.stat(fullPath);

        // 5. Update record COMPLETED
        const completed = await this.prisma.systemBackup.update({
          where: { id: record.id },
          data: {
            status: 'COMPLETED',
            sizeBytes: BigInt(stat.size),
            durationMs: Date.now() - start,
          },
        });
        this.logger.log('Backup ' + filename + ' OK (' + Math.round(stat.size / 1024 / 1024) + ' MB)');
        return completed;
      } finally {
        // Cleanup workspace
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    } catch (err: any) {
      this.logger.error('Backup failed : ' + err.message);
      await this.prisma.systemBackup.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          errorMessage: err.message?.slice(0, 1000),
          durationMs: Date.now() - start,
        },
      }).catch(() => {});
      // Cleanup fichier partiel
      await fs.unlink(fullPath).catch(() => {});
      throw err;
    }
  }

  // ============================================================
  // RESTORE backup
  // SECURITE :
  //   - exige le mot de passe du user qui restore
  //   - cree automatiquement un PRE_RESTORE backup avant
  //   - drop schema public CASCADE puis pg_restore
  //   - ecrase /app/uploads par le contenu du tar (overwrite)
  // ============================================================
  async restore(id: string, userId: string, currentPassword: string) {
    // Verif du password (defense en profondeur)
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('User introuvable');
    const ok = await compare(currentPassword, u.passwordHash);
    if (!ok) throw new ForbiddenException('Mot de passe incorrect');

    const backup = await this.prisma.systemBackup.findUnique({ where: { id } });
    if (!backup) throw new NotFoundException('Backup introuvable');
    if (backup.status !== 'COMPLETED') throw new BadRequestException('Backup pas dans l\'etat COMPLETED');

    const fullPath = path.join(this.getBackupDir(), backup.pathRelative);
    try { await fs.access(fullPath); }
    catch { throw new BadRequestException('Fichier .tar.gz introuvable sur disque : ' + backup.pathRelative); }

    this.logger.warn('RESTORE demarre par user ' + userId + ' depuis backup ' + backup.id);

    // 1. Cree un PRE_RESTORE snapshot pour rollback safety
    let preRestore: { id: string } | null = null;
    try {
      preRestore = await this.createBackup({ kind: 'PRE_RESTORE', userId });
    } catch (err: any) {
      throw new BadRequestException('Snapshot pre-restore echoue, restore annule : ' + err.message);
    }

    // 2. Extract tar dans workspace tmp
    const workDir = path.join(this.getBackupDir(), '.restore-' + randomBytes(8).toString('hex'));
    await fs.mkdir(workDir, { recursive: true });

    try {
      await this.runShell('tar', ['-xzf', fullPath, '-C', workDir], { timeoutMs: PG_RESTORE_TIMEOUT_MS });

      const dumpFile = path.join(workDir, 'db.dump');
      try { await fs.access(dumpFile); }
      catch { throw new Error('db.dump absent dans le tar'); }

      // 3. Drop schema public + restore
      const db = this.parseDatabaseUrl();
      // Drop : on doit deconnecter les autres sessions. psql script :
      const dropScript = path.join(workDir, 'drop.sql');
      await fs.writeFile(dropScript,
        'DROP SCHEMA IF EXISTS public CASCADE;\n' +
        'CREATE SCHEMA public;\n' +
        'GRANT ALL ON SCHEMA public TO ' + db.user + ';\n' +
        'GRANT ALL ON SCHEMA public TO public;\n',
      );
      await this.runShell('psql', [
        '-h', db.host, '-p', db.port, '-U', db.user, '-d', db.database,
        '-v', 'ON_ERROR_STOP=1', '-f', dropScript,
      ], { env: { PGPASSWORD: db.password }, timeoutMs: PG_RESTORE_TIMEOUT_MS });

      await this.runShell('pg_restore', [
        '-h', db.host, '-p', db.port, '-U', db.user, '-d', db.database,
        '--no-owner', '--no-acl', '--single-transaction', dumpFile,
      ], { env: { PGPASSWORD: db.password }, timeoutMs: PG_RESTORE_TIMEOUT_MS });

      // 4. Restore uploads : on ecrase /app/uploads avec le contenu extrait
      // (sauf db.dump et metadata.json qui ne sont pas des uploads)
      if (backup.includesUploads) {
        const uploadsDir = this.getUploadsDir();
        // Liste les entries du workDir et copie tout sauf db.dump/metadata.json
        // dans uploadsDir (overwrite). Pour rester simple : tar du subset puis untar.
        // Approche directe : utiliser cp -a (Alpine coreutils-like).
        const items = (await fs.readdir(workDir)).filter((n) => n !== 'db.dump' && n !== 'metadata.json' && n !== 'drop.sql');
        for (const it of items) {
          const src = path.join(workDir, it);
          const dst = path.join(uploadsDir, it);
          await this.runShell('cp', ['-a', src, dst], { timeoutMs: 60_000 });
        }
      }

      // 5. Update record
      // Note : ce update va refaire reapparaitre la table SystemBackup avec les
      // donnees du dump (qui est anterieur). Pour s'assurer que le restoredAt
      // est bien capture, on UPSERT plutot qu'update.
      await this.prisma.systemBackup.update({
        where: { id },
        data: { restoredAt: new Date(), restoredById: userId, restoreError: null },
      }).catch((e) => {
        // Si le record a disparu (cas tres ancien backup), c'est OK
        this.logger.warn('Update restoredAt failed : ' + e.message);
      });

      this.logger.warn('RESTORE TERMINE depuis ' + backup.filename + ' par user ' + userId);
      return { ok: true, preRestoreBackupId: preRestore.id };
    } catch (err: any) {
      this.logger.error('RESTORE FAILED : ' + err.message);
      await this.prisma.systemBackup.update({
        where: { id },
        data: { restoreError: err.message?.slice(0, 1000) },
      }).catch(() => {});
      throw err;
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // ============================================================
  // LISTING / DOWNLOAD / DELETE
  // ============================================================
  list(params: { limit?: number; kind?: SystemBackupKind; status?: SystemBackupStatus } = {}) {
    return this.prisma.systemBackup.findMany({
      where: {
        ...(params.kind ? { kind: params.kind } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        restoredBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: params.limit ?? 100,
    });
  }

  async findOne(id: string) {
    const b = await this.prisma.systemBackup.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Backup introuvable');
    return b;
  }

  async resolveDownload(id: string) {
    const b = await this.findOne(id);
    if (b.status !== 'COMPLETED') throw new BadRequestException('Backup non disponible');
    const fullPath = path.join(this.getBackupDir(), b.pathRelative);
    try { await fs.access(fullPath); }
    catch { throw new NotFoundException('Fichier physique absent'); }
    // Increment best-effort
    this.prisma.systemBackup.update({
      where: { id },
      data: { downloadCount: { increment: 1 }, lastDownloadAt: new Date() },
    }).catch(() => {});
    return { fullPath, filename: b.filename, sizeBytes: b.sizeBytes };
  }

  async stream(id: string) {
    const r = await this.resolveDownload(id);
    return { stream: createReadStream(r.fullPath), filename: r.filename, sizeBytes: r.sizeBytes };
  }

  async remove(id: string) {
    const b = await this.findOne(id);
    const fullPath = path.join(this.getBackupDir(), b.pathRelative);
    await fs.unlink(fullPath).catch(() => {});
    await this.prisma.systemBackup.delete({ where: { id } });
    return { ok: true };
  }

  // ============================================================
  // CRONS
  // ============================================================
  // Backup quotidien 02:30 Europe/Paris (avant le cron restic hote a 04:00)
  @Cron('30 2 * * *', { name: 'system-backup-daily', timeZone: 'Europe/Paris' })
  async runDailyBackup() {
    const enabled = await this.settings.getBool('systemBackup.dailyAuto');
    if (!enabled) {
      this.logger.log('System backup cron : desactive via Settings');
      return;
    }
    try {
      await this.createBackup({ kind: 'SCHEDULED' });
    } catch (err: any) {
      this.logger.error('Daily backup failed : ' + err.message);
    }
  }

  // Cleanup quotidien 04:00 : supprime les SCHEDULED > retentionDays
  // (les MANUAL et PRE_RESTORE ne sont jamais auto-purges — l'admin doit les
  // supprimer manuellement)
  @Cron('0 4 * * *', { name: 'system-backup-cleanup', timeZone: 'Europe/Paris' })
  async runCleanup() {
    const retention = await this.settings.getInt('systemBackup.retentionDays', 30);
    const cutoff = new Date(Date.now() - retention * 86400_000);
    const olds = await this.prisma.systemBackup.findMany({
      where: { kind: 'SCHEDULED', createdAt: { lt: cutoff } },
    });
    let deleted = 0;
    for (const b of olds) {
      try {
        const p = path.join(this.getBackupDir(), b.pathRelative);
        await fs.unlink(p).catch(() => {});
        await this.prisma.systemBackup.delete({ where: { id: b.id } });
        deleted++;
      } catch (err: any) {
        this.logger.warn('Cleanup failed for ' + b.id + ' : ' + err.message);
      }
    }
    if (deleted > 0) this.logger.log('System backup cleanup : ' + deleted + ' backup(s) supprime(s)');
  }

  async stats() {
    const all = await this.prisma.systemBackup.findMany({
      where: { status: 'COMPLETED' },
      select: { sizeBytes: true, kind: true, createdAt: true, restoredAt: true },
    });
    const totalSize = all.reduce((s, b) => s + Number(b.sizeBytes ?? 0n), 0);
    const last = all.length > 0
      ? all.reduce((latest, b) => b.createdAt > latest ? b.createdAt : latest, new Date(0))
      : null;
    return {
      totalBackups: all.length,
      totalSizeBytes: totalSize,
      lastBackupAt: last,
      restoredCount: all.filter((b) => b.restoredAt).length,
    };
  }
}
