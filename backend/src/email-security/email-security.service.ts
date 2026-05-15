import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { computeScore, lookupDkim, lookupDmarc, lookupSpf } from './dns-utils';

@Injectable()
export class EmailSecurityService {
  private readonly logger = new Logger(EmailSecurityService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  // Verification d'un domaine : appelle DNS + upsert resultat
  // ============================================================
  async checkDomain(domain: string, companyId?: string) {
    const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    let spf, dmarc, dkim, score: number, error: string | null = null;
    try {
      [spf, dmarc, dkim] = await Promise.all([
        lookupSpf(cleanDomain),
        lookupDmarc(cleanDomain),
        lookupDkim(cleanDomain),
      ]);
      score = computeScore(spf, dmarc, dkim);
    } catch (err: any) {
      this.logger.warn('DNS check failed for ' + cleanDomain + ' : ' + err.message);
      spf = { record: null, policy: null };
      dmarc = { record: null, policy: null, rua: null, subdomainPolicy: null };
      dkim = { selector: null, record: null, present: false };
      score = 0;
      error = err.message?.slice(0, 500) ?? 'unknown';
    }

    return this.prisma.emailSecurityCheck.upsert({
      where: { domain: cleanDomain },
      create: {
        domain: cleanDomain,
        companyId: companyId ?? null,
        spfRecord: spf.record,
        spfPolicy: spf.policy,
        dmarcRecord: dmarc.record,
        dmarcPolicy: dmarc.policy,
        dmarcRua: dmarc.rua,
        dmarcSubdomainPolicy: dmarc.subdomainPolicy,
        dkimSelector: dkim.selector,
        dkimRecord: dkim.record,
        dkimPresent: dkim.present,
        scorePct: score,
        error,
        lastCheckedAt: new Date(),
      },
      update: {
        companyId: companyId ?? undefined,
        spfRecord: spf.record,
        spfPolicy: spf.policy,
        dmarcRecord: dmarc.record,
        dmarcPolicy: dmarc.policy,
        dmarcRua: dmarc.rua,
        dmarcSubdomainPolicy: dmarc.subdomainPolicy,
        dkimSelector: dkim.selector,
        dkimRecord: dkim.record,
        dkimPresent: dkim.present,
        scorePct: score,
        error,
        lastCheckedAt: new Date(),
      },
    });
  }

  // ============================================================
  // Liste / lecture
  // ============================================================
  async listAll(params: { companyId?: string } = {}) {
    return this.prisma.emailSecurityCheck.findMany({
      where: params.companyId ? { companyId: params.companyId } : {},
      include: { company: { select: { id: true, name: true } } },
      orderBy: { scorePct: 'asc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.emailSecurityCheck.findUnique({
      where: { id },
      include: { company: { select: { id: true, name: true } } },
    });
  }

  async findByDomain(domain: string) {
    return this.prisma.emailSecurityCheck.findUnique({
      where: { domain: domain.toLowerCase().trim() },
      include: { company: { select: { id: true, name: true } } },
    });
  }

  async stats() {
    const all = await this.prisma.emailSecurityCheck.findMany({
      select: { scorePct: true, dmarcPolicy: true, spfPolicy: true, dkimPresent: true },
    });
    const total = all.length;
    if (total === 0) return { total: 0, avgScore: 0, weakDomains: 0, strongDomains: 0, dmarcEnforced: 0 };
    const avg = all.reduce((s, x) => s + x.scorePct, 0) / total;
    return {
      total,
      avgScore: Math.round(avg),
      weakDomains: all.filter((x) => x.scorePct < 50).length,
      strongDomains: all.filter((x) => x.scorePct >= 80).length,
      dmarcEnforced: all.filter((x) => x.dmarcPolicy === 'reject' || x.dmarcPolicy === 'quarantine').length,
    };
  }

  // ============================================================
  // Cron quotidien : re-check tous les domaines (Asset type=DOMAIN actifs)
  // 03:30 Europe/Paris (apres backup, avant heure de bureau)
  // ============================================================
  @Cron('30 3 * * *', { name: 'email-security-daily', timeZone: 'Europe/Paris' })
  async runDaily() {
    const domains = await this.prisma.asset.findMany({
      where: { type: 'DOMAIN', status: 'ACTIVE' },
      select: { id: true, name: true, identifier: true, companyId: true },
    });
    let ok = 0, failed = 0;
    for (const d of domains) {
      // Privilegie identifier (FQDN propre) sinon name
      const domain = (d.identifier ?? d.name).trim();
      if (!domain) continue;
      try {
        await this.checkDomain(domain, d.companyId);
        ok++;
      } catch (err: any) {
        failed++;
        this.logger.warn('Email security check failed for ' + domain + ' : ' + err.message);
      }
    }
    this.logger.log('Email security cron : ' + ok + ' OK, ' + failed + ' echecs');
  }

  // Trigger manuel : re-check immediat de tous les domaines d'une company
  async checkAllForCompany(companyId: string) {
    const domains = await this.prisma.asset.findMany({
      where: { type: 'DOMAIN', status: 'ACTIVE', companyId },
      select: { name: true, identifier: true },
    });
    const results: Awaited<ReturnType<EmailSecurityService['checkDomain']>>[] = [];
    for (const d of domains) {
      const domain = (d.identifier ?? d.name).trim();
      if (!domain) continue;
      try { results.push(await this.checkDomain(domain, companyId)); }
      catch (err: any) { /* swallow per-domain */ }
    }
    return results;
  }
}
