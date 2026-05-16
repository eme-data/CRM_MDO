import { ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { authenticator } from 'otplib';
import { PrismaService } from '../database/prisma.service';
import { CreateSecretDto } from './dto/create-secret.dto';
import { JwtUser } from '../common/decorators/current-user.decorator';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

@Injectable()
export class SecretsService implements OnModuleInit {
  private readonly logger = new Logger(SecretsService.name);
  private masterKey?: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const raw = process.env.SECRETS_MASTER_KEY ?? this.config.get<string>('jwt.secret');
    if (!raw) {
      this.logger.warn('SECRETS_MASTER_KEY non defini : coffre desactive');
      return;
    }
    // Derive une cle 256-bit deterministe
    this.masterKey = scryptSync(raw, 'crm-mdo-secrets-salt', 32);
  }

  encrypt(plain: string): string {
    if (!this.masterKey) throw new ServiceUnavailableException('Coffre non configure');
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  decrypt(stored: string): string {
    if (!this.masterKey) throw new ServiceUnavailableException('Coffre non configure');
    const buf = Buffer.from(stored, 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const authTag = buf.subarray(IV_LEN, IV_LEN + 16);
    const encrypted = buf.subarray(IV_LEN + 16);
    const decipher = createDecipheriv(ALGO, this.masterKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  // Extrait la cle base32 d'une valeur TOTP brute (cle nue ou URI otpauth://)
  private parseTotpSecret(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith('otpauth://')) {
      const m = trimmed.match(/[?&]secret=([^&]+)/i);
      if (m) return m[1].toUpperCase().replace(/\s/g, '');
    }
    return trimmed.toUpperCase().replace(/\s/g, '');
  }

  // Genere le code TOTP courant a partir d'un secret base32 chiffre
  private generateTotpCode(cipheredTotp: string | null | undefined): { code: string; secondsRemaining: number } | null {
    if (!cipheredTotp) return null;
    try {
      const secret = this.decrypt(cipheredTotp);
      const code = authenticator.generate(secret);
      const epoch = Math.floor(Date.now() / 1000);
      const step = 30;
      const secondsRemaining = step - (epoch % step);
      return { code, secondsRemaining };
    } catch (err: any) {
      this.logger.warn('TOTP generation failed: ' + err.message);
      return null;
    }
  }

  // Garde-fou multi-tenant : verifie que le companyId reference appartient
  // bien au tenant courant. Sinon, un user A pourrait creer un secret rattache
  // a une company du tenant B. Super-admin bypasse (peut tout voir/creer).
  private async assertCompanyInTenant(companyId: string, me: JwtUser) {
    if (me.isSuperAdmin) return;
    const c = await this.prisma.company.findFirst({
      where: { id: companyId, tenantId: me.tenantId ?? undefined },
      select: { id: true },
    });
    if (!c) throw new ForbiddenException('Societe inaccessible dans ce tenant');
  }

  // Lookup d'un secret avec garde tenant : retourne 404 (pas 403) si le
  // secret existe dans un autre tenant — on ne revele pas son existence.
  private async findSecretInTenant(id: string, me: JwtUser) {
    const where: any = { id };
    if (!me.isSuperAdmin) where.tenantId = me.tenantId;
    const s = await this.prisma.secretEntry.findFirst({ where });
    if (!s) throw new NotFoundException();
    return s;
  }

  // ============ CRUD ============

  async listForCompany(companyId: string, me: JwtUser) {
    await this.assertCompanyInTenant(companyId, me);
    const items = await this.prisma.secretEntry.findMany({
      where: { companyId },
      orderBy: { updatedAt: 'desc' },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
    // On NE retourne JAMAIS la valeur dans la liste
    return items.map((s) => ({
      ...s,
      cipheredValue: undefined,
      cipheredTotp: undefined,
      hasValue: Boolean(s.cipheredValue),
      hasTotp: Boolean(s.cipheredTotp),
    }));
  }

  async reveal(id: string, me: JwtUser) {
    const s = await this.findSecretInTenant(id, me);
    await this.prisma.secretEntry.update({
      where: { id },
      data: { lastAccessedAt: new Date() },
    });
    await this.prisma.activity.create({
      data: { userId: me.id, action: 'REVEAL_SECRET', entity: 'SecretEntry', entityId: id, tenantId: s.tenantId },
    });
    const totp = this.generateTotpCode(s.cipheredTotp);
    return {
      id: s.id,
      label: s.label,
      username: s.username,
      url: s.url,
      value: this.decrypt(s.cipheredValue),
      totp, // { code, secondsRemaining } ou null
    };
  }

  // Genere uniquement le code TOTP (sans reveler le mot de passe).
  // Utile pour auto-refresh cote UI sans exposer la valeur.
  async getTotp(id: string, me: JwtUser) {
    const s = await this.findSecretInTenant(id, me);
    if (!s.cipheredTotp) return { code: null, secondsRemaining: 0 };
    await this.prisma.activity.create({
      data: { userId: me.id, action: 'GENERATE_TOTP', entity: 'SecretEntry', entityId: id, tenantId: s.tenantId },
    });
    return this.generateTotpCode(s.cipheredTotp);
  }

  // Liste l'historique d'acces a un secret (Activity)
  async accessLog(id: string, me: JwtUser) {
    // Verifie l'acces avant de lister l'historique : eviter de leaker
    // l'audit-trail d'un secret d'un autre tenant.
    await this.findSecretInTenant(id, me);
    const events = await this.prisma.activity.findMany({
      where: {
        entity: 'SecretEntry',
        entityId: id,
        action: { in: ['REVEAL_SECRET', 'GENERATE_TOTP', 'DELETE_SECRET'] },
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return events;
  }

  async create(dto: CreateSecretDto, me: JwtUser) {
    await this.assertCompanyInTenant(dto.companyId, me);
    const ciphered = this.encrypt(dto.value);
    const cipheredTotp = dto.totpSecret ? this.encrypt(this.parseTotpSecret(dto.totpSecret)) : null;
    const created = await this.prisma.secretEntry.create({
      data: {
        tenantId: me.tenantId,
        companyId: dto.companyId,
        label: dto.label,
        username: dto.username,
        url: dto.url,
        category: dto.category,
        notes: dto.notes,
        cipheredValue: ciphered,
        cipheredTotp,
        createdById: me.id,
      },
    });
    return { ...created, cipheredValue: undefined, cipheredTotp: undefined };
  }

  async update(id: string, dto: Partial<CreateSecretDto>, me: JwtUser) {
    await this.findSecretInTenant(id, me);
    const data: any = {
      label: dto.label,
      username: dto.username,
      url: dto.url,
      category: dto.category,
      notes: dto.notes,
    };
    if (dto.value && dto.value.trim()) data.cipheredValue = this.encrypt(dto.value);
    if (dto.totpSecret !== undefined) {
      data.cipheredTotp = dto.totpSecret && dto.totpSecret.trim()
        ? this.encrypt(this.parseTotpSecret(dto.totpSecret))
        : null;
    }
    const updated = await this.prisma.secretEntry.update({ where: { id }, data });
    return { ...updated, cipheredValue: undefined, cipheredTotp: undefined };
  }

  async remove(id: string, me: JwtUser) {
    const s = await this.findSecretInTenant(id, me);
    await this.prisma.secretEntry.delete({ where: { id } });
    await this.prisma.activity.create({
      data: { userId: me.id, action: 'DELETE_SECRET', entity: 'SecretEntry', entityId: id, tenantId: s.tenantId },
    });
    return { success: true };
  }
}
