import { Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { CreateSecretDto } from './dto/create-secret.dto';

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

  // ============ CRUD ============

  async listForCompany(companyId: string) {
    const items = await this.prisma.secretEntry.findMany({
      where: { companyId },
      orderBy: { updatedAt: 'desc' },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
    // On NE retourne JAMAIS la valeur dans la liste
    return items.map((s) => ({
      ...s,
      cipheredValue: undefined,
      hasValue: Boolean(s.cipheredValue),
    }));
  }

  async reveal(id: string, userId: string) {
    const s = await this.prisma.secretEntry.findUnique({ where: { id } });
    if (!s) throw new NotFoundException();
    await this.prisma.secretEntry.update({
      where: { id },
      data: { lastAccessedAt: new Date() },
    });
    await this.prisma.activity.create({
      data: { userId, action: 'REVEAL_SECRET', entity: 'SecretEntry', entityId: id },
    });
    return {
      id: s.id,
      label: s.label,
      username: s.username,
      url: s.url,
      value: this.decrypt(s.cipheredValue),
    };
  }

  async create(dto: CreateSecretDto, userId: string) {
    const ciphered = this.encrypt(dto.value);
    const created = await this.prisma.secretEntry.create({
      data: {
        companyId: dto.companyId,
        label: dto.label,
        username: dto.username,
        url: dto.url,
        category: dto.category,
        notes: dto.notes,
        cipheredValue: ciphered,
        createdById: userId,
      },
    });
    return { ...created, cipheredValue: undefined };
  }

  async update(id: string, dto: Partial<CreateSecretDto>, userId: string) {
    const existing = await this.prisma.secretEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException();
    const data: any = {
      label: dto.label,
      username: dto.username,
      url: dto.url,
      category: dto.category,
      notes: dto.notes,
    };
    if (dto.value && dto.value.trim()) data.cipheredValue = this.encrypt(dto.value);
    const updated = await this.prisma.secretEntry.update({ where: { id }, data });
    return { ...updated, cipheredValue: undefined };
  }

  async remove(id: string, userId: string) {
    await this.prisma.secretEntry.delete({ where: { id } });
    await this.prisma.activity.create({
      data: { userId, action: 'DELETE_SECRET', entity: 'SecretEntry', entityId: id },
    });
    return { success: true };
  }
}
