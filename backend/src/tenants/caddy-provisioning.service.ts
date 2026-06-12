import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PrismaService } from '../database/prisma.service';

// CaddyProvisioningService : regenere la config Caddy depuis la liste des
// tenants actifs et la pousse via l'admin API Caddy (POST /load).
//
// Pourquoi : revendre le CRM aux DSI = nouveau domaine custom a chaque
// client (crm.client-dsi.fr). Sans automatisation, Mathieu doit editer le
// Caddyfile a la main + reload, ce qui ne scale pas. Avec ce service :
// "Creer tenant dans UI super-admin" → Caddy router auto + ACME auto sur
// la prochaine requete vers le nouveau domaine.
//
// Mode CIBLE pour ENVs avec admin Caddy expose :
//   CADDY_ADMIN_URL=http://caddy:2019
//   CADDY_PROVISIONING=enabled
//
// Le service :
//   1. Lis la liste des tenants actifs (slug, customDomain) depuis Prisma
//   2. Genere une Caddyfile complete (template MDO + un site block par tenant)
//   3. POST /load a l'admin API Caddy avec Content-Type: text/caddyfile
//      → Caddy reload la config en place, declenche ACME sur les nouveaux
//        domaines, garde les certs deja emis (Caddy auto-cache).
//   4. Ecrit aussi le Caddyfile sur disque (CADDY_CONFIG_PATH) pour debug
//      et restauration au prochain boot Caddy (volume persistant).
//
// Auto-trigger : appele depuis TenantsService.create/update/remove.

interface TenantSiteSpec {
  slug: string;
  customDomain: string;
}

@Injectable()
export class CaddyProvisioningService implements OnModuleInit {
  private readonly logger = new Logger(CaddyProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // Au boot du backend, push la config courante a Caddy. Caddy demarre
  // AVANT le backend avec une config par defaut (admin API :2019, pas de
  // HTTP serving). Une fois le backend pret, ce hook envoie la Caddyfile
  // complete → Caddy commence a router. Decouple completement la generation
  // de l'image Caddy.
  // Best-effort : si Caddy n'est pas joignable (env dev sans Caddy), on
  // log un warning et on continue le boot du backend.
  async onModuleInit() {
    if (!this.isEnabled()) return;
    try {
      const r = await this.regenerate();
      this.logger.log(`Caddy bootstrap : ${r.tenantsApplied} site(s) charge(s)`);
    } catch (err: any) {
      this.logger.warn(`Caddy bootstrap echec (admin peut relancer via POST /tenants/regenerate-caddy) : ${err.message}`);
    }
  }

  // Active si CADDY_PROVISIONING=enabled. Sinon (env de dev sans Caddy expose),
  // on no-op et on log juste un debug.
  private isEnabled(): boolean {
    return this.config.get<string>('CADDY_PROVISIONING') === 'enabled';
  }

  // POST /load doit accepter Caddyfile en texte. URL admin par defaut
  // http://caddy:2019 (network Docker), modifiable via CADDY_ADMIN_URL.
  private get adminUrl(): string {
    return this.config.get<string>('CADDY_ADMIN_URL') ?? 'http://caddy:2019';
  }

  // Fichier sur disque pour persistance (lu par Caddy au boot).
  private get configPath(): string {
    return this.config.get<string>('CADDY_CONFIG_PATH') ?? '/etc/caddy/Caddyfile';
  }

  // Email pour ACME Let's Encrypt. Repris du ConfigService (deja utilise
  // dans le Caddyfile statique via {$ACME_EMAIL}).
  private get acmeEmail(): string {
    return this.config.get<string>('ACME_EMAIL') ?? 'admin@mdoservices.fr';
  }

  // Adresse d'ecoute de l'admin API Caddy. DOIT rester sur 0.0.0.0:2019 (et pas
  // le defaut localhost:2019) sinon le backend, dans un autre conteneur, ne peut
  // plus joindre l'admin API apres un reload -> plus aucun provisioning possible.
  // cf bloc global du Caddyfile statique (docker/caddy/Caddyfile).
  private get adminListen(): string {
    return this.config.get<string>('CADDY_ADMIN_LISTEN') ?? '0.0.0.0:2019';
  }

  // Genere la Caddyfile complete : un global block + un site block par tenant.
  // Chaque site block route /api/* vers backend, /health vers backend,
  // /metrics restreint LAN, le reste vers frontend (Next.js).
  buildCaddyfile(sites: TenantSiteSpec[]): string {
    const sitesBlocks = sites
      .map((s) => this.siteBlock(s.customDomain))
      .join('\n\n');

    return [
      // Bloc global
      `{`,
      `    email ${this.acmeEmail}`,
      // Admin API joignable par le conteneur backend (sinon plus de reload possible).
      `    admin ${this.adminListen}`,
      `    servers {`,
      `        trusted_proxies static private_ranges`,
      `    }`,
      `}`,
      '',
      sitesBlocks,
    ].join('\n');
  }

  private siteBlock(domain: string): string {
    return [
      `${domain} {`,
      `    encode zstd gzip`,
      `    log {`,
      `        output file /var/log/caddy/access.log {`,
      `            roll_size 100MiB`,
      `            roll_keep 5`,
      `        }`,
      `        format json`,
      `    }`,
      `    header {`,
      `        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"`,
      `        X-Frame-Options "DENY"`,
      `        X-Content-Type-Options "nosniff"`,
      `        Referrer-Policy "strict-origin-when-cross-origin"`,
      `        Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"`,
      `        Cross-Origin-Opener-Policy "same-origin"`,
      `        Cross-Origin-Resource-Policy "same-origin"`,
      `        -Server`,
      `    }`,
      `    handle /api/* {`,
      `        reverse_proxy backend:4000`,
      `    }`,
      `    handle /health {`,
      `        reverse_proxy backend:4000`,
      `    }`,
      `    handle /metrics {`,
      `        @internal remote_ip 127.0.0.1 172.16.0.0/12 10.0.0.0/8`,
      `        handle @internal {`,
      `            reverse_proxy backend:4000`,
      `        }`,
      `        respond 403`,
      `    }`,
      `    handle {`,
      `        reverse_proxy frontend:3000`,
      `    }`,
      `}`,
    ].join('\n');
  }

  // Regenere et applique la config. Atomique cote Caddy (admin API rollback
  // si parse fail). Throw si reload Caddy echoue (laisse l'ancienne config
  // en place pour ne pas casser la prod).
  async regenerate(): Promise<{ tenantsApplied: number; reloaded: boolean }> {
    if (!this.isEnabled()) {
      this.logger.debug('Caddy provisioning disabled (CADDY_PROVISIONING != enabled)');
      return { tenantsApplied: 0, reloaded: false };
    }

    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { slug: true, customDomain: true },
      orderBy: { slug: 'asc' },
    });
    const caddyfile = this.buildCaddyfile(tenants);

    // 1. Reload Caddy via admin API
    try {
      const r = await fetch(`${this.adminUrl}/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/caddyfile' },
        body: caddyfile,
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`Caddy /load HTTP ${r.status} : ${txt.slice(0, 500)}`);
      }
    } catch (err: any) {
      this.logger.error(`Caddy reload echec : ${err.message}`);
      throw new Error('Caddy reload echec : ' + err.message);
    }

    // 2. Persiste sur disque pour le prochain restart de Caddy (best-effort).
    //    En cas d'echec ici, la config courante est OK (deja chargee in-memory)
    //    mais sera perdue au prochain restart. On log juste un warning.
    try {
      await fs.mkdir(path.dirname(this.configPath), { recursive: true });
      await fs.writeFile(this.configPath, caddyfile, 'utf-8');
    } catch (err: any) {
      this.logger.warn(`Caddy config persist echec (reload OK) : ${err.message}`);
    }

    this.logger.log(`Caddy reload OK : ${tenants.length} tenant(s) actifs en config`);
    return { tenantsApplied: tenants.length, reloaded: true };
  }

  // Best-effort auto-trigger appele depuis TenantsService.create/update/remove.
  // Ne throw JAMAIS : un echec Caddy ne doit pas bloquer la mutation tenant
  // (l'admin peut relancer manuellement via POST /tenants/regenerate-caddy).
  async triggerSilent(reason: string): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      const r = await this.regenerate();
      this.logger.log(`Caddy auto-reload (${reason}) : ${r.tenantsApplied} sites`);
    } catch (err: any) {
      this.logger.warn(`Caddy auto-reload echec (${reason}) : ${err.message} — admin peut relancer manuellement`);
    }
  }
}
