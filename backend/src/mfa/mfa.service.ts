import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { SecretsService } from '../client-docs/secrets.service';

const ISSUER = 'CRM MDO Services';

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
  ) {}

  async status(userId: string) {
    const m = await this.prisma.userMfa.findUnique({ where: { userId } });
    return { enabled: !!m?.enabled };
  }

  // Genere un secret TOTP, ne l'active PAS encore tant que l'utilisateur n'a pas verifie un code
  async setup(userId: string, userEmail: string) {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(userEmail, ISSUER, secret);
    const qr = await QRCode.toDataURL(otpauth);
    const ciphered = this.secrets.encrypt(secret);
    // Codes de recuperation : 8 codes de 10 caracteres
    const recoveryCodes = Array.from({ length: 8 }, () => randomBytes(5).toString('hex'));
    const hashedCodes = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, 10)));

    await this.prisma.userMfa.upsert({
      where: { userId },
      create: {
        userId,
        secret: ciphered,
        recoveryCodes: JSON.stringify(hashedCodes),
        enabled: false,
      },
      update: {
        secret: ciphered,
        recoveryCodes: JSON.stringify(hashedCodes),
        enabled: false,
      },
    });

    return { qr, otpauth, recoveryCodes };
  }

  async enable(userId: string, code: string) {
    const m = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!m) throw new NotFoundException('Configurez d\'abord la 2FA');
    const secret = this.secrets.decrypt(m.secret);
    if (!authenticator.check(code, secret)) {
      throw new BadRequestException('Code TOTP invalide');
    }
    await this.prisma.userMfa.update({
      where: { userId },
      data: { enabled: true, enabledAt: new Date() },
    });
    return { enabled: true };
  }

  async disable(userId: string, code: string) {
    const m = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!m || !m.enabled) return { enabled: false };
    const secret = this.secrets.decrypt(m.secret);
    if (!authenticator.check(code, secret)) {
      throw new BadRequestException('Code TOTP invalide');
    }
    await this.prisma.userMfa.delete({ where: { userId } });
    return { enabled: false };
  }

  // Verifie un code TOTP (ou recovery code) lors du login
  async verify(userId: string, code: string): Promise<boolean> {
    const m = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!m || !m.enabled) return true; // pas de 2FA = pas de check
    const secret = this.secrets.decrypt(m.secret);
    if (authenticator.check(code, secret)) return true;
    // Sinon : essayer recovery codes
    const codes: string[] = JSON.parse(m.recoveryCodes);
    for (let i = 0; i < codes.length; i++) {
      if (await bcrypt.compare(code, codes[i])) {
        // consomme le code
        codes.splice(i, 1);
        await this.prisma.userMfa.update({
          where: { userId },
          data: { recoveryCodes: JSON.stringify(codes) },
        });
        return true;
      }
    }
    return false;
  }

  async isEnabledFor(userId: string): Promise<boolean> {
    const m = await this.prisma.userMfa.findUnique({ where: { userId } });
    return !!m?.enabled;
  }
}
