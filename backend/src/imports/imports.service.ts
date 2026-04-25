import { Injectable, Logger } from '@nestjs/common';
import * as Papa from 'papaparse';
import { PrismaService } from '../database/prisma.service';

interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ============ COMPANIES ============
  // Colonnes attendues (insensitive a la casse) : name, siret, siren, email, phone, address,
  // postalCode, city, sector, status, website
  async importCompanies(csv: string, ownerId: string): Promise<ImportResult> {
    const parsed = Papa.parse<any>(csv, { header: true, skipEmptyLines: true });
    const result: ImportResult = { total: 0, created: 0, updated: 0, skipped: 0, errors: [] };

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      result.total++;
      const name = this.s(row, 'name');
      if (!name) {
        result.errors.push({ row: i + 2, reason: 'name manquant' });
        continue;
      }
      const siret = this.s(row, 'siret');
      const siren = this.s(row, 'siren');

      // Dedup par SIRET prio, sinon SIREN, sinon nom
      let existing: any = null;
      if (siret) existing = await this.prisma.company.findUnique({ where: { siret } });
      if (!existing && siren) existing = await this.prisma.company.findUnique({ where: { siren } });
      if (!existing) existing = await this.prisma.company.findFirst({ where: { name } });

      const data = {
        name,
        siret: siret || undefined,
        siren: siren || undefined,
        email: this.s(row, 'email') || undefined,
        phone: this.s(row, 'phone') || undefined,
        address: this.s(row, 'address') || undefined,
        postalCode: this.s(row, 'postalCode') || undefined,
        city: this.s(row, 'city') || undefined,
        website: this.s(row, 'website') || undefined,
        sector: this.parseEnum(this.s(row, 'sector'), [
          'PME', 'TPE', 'COLLECTIVITE', 'SANTE', 'INDUSTRIE', 'EDUCATION', 'ASSOCIATION', 'AUTRE',
        ]) ?? 'PME',
        status: this.parseEnum(this.s(row, 'status'), ['LEAD', 'PROSPECT', 'CUSTOMER', 'INACTIVE']) ?? 'LEAD',
      };

      try {
        if (existing) {
          await this.prisma.company.update({ where: { id: existing.id }, data });
          result.updated++;
        } else {
          await this.prisma.company.create({ data: { ...data, ownerId } });
          result.created++;
        }
      } catch (err: any) {
        result.errors.push({ row: i + 2, reason: err.message });
      }
    }

    return result;
  }

  // ============ CONTACTS ============
  // Colonnes : firstName, lastName, email, phone, mobile, position, companyName (matching par nom)
  async importContacts(csv: string, ownerId: string): Promise<ImportResult> {
    const parsed = Papa.parse<any>(csv, { header: true, skipEmptyLines: true });
    const result: ImportResult = { total: 0, created: 0, updated: 0, skipped: 0, errors: [] };

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      result.total++;
      const firstName = this.s(row, 'firstName');
      const lastName = this.s(row, 'lastName');
      if (!firstName || !lastName) {
        result.errors.push({ row: i + 2, reason: 'firstName/lastName manquant' });
        continue;
      }
      const email = this.s(row, 'email');
      const companyName = this.s(row, 'companyName');

      // Match company par nom si fourni
      let companyId: string | undefined;
      if (companyName) {
        const c = await this.prisma.company.findFirst({ where: { name: companyName } });
        if (c) companyId = c.id;
        else result.errors.push({ row: i + 2, reason: 'Company non trouvee : ' + companyName });
      }

      // Dedup contact par email s'il y en a un
      let existing: any = null;
      if (email) {
        existing = await this.prisma.contact.findFirst({ where: { email } });
      }

      const data = {
        firstName,
        lastName,
        email: email || undefined,
        phone: this.s(row, 'phone') || undefined,
        mobile: this.s(row, 'mobile') || undefined,
        position: this.s(row, 'position') || undefined,
        companyId,
      };

      try {
        if (existing) {
          await this.prisma.contact.update({ where: { id: existing.id }, data });
          result.updated++;
        } else {
          await this.prisma.contact.create({ data: { ...data, ownerId } });
          result.created++;
        }
      } catch (err: any) {
        result.errors.push({ row: i + 2, reason: err.message });
      }
    }

    return result;
  }

  private s(row: any, field: string): string {
    // Match insensitive case
    for (const k of Object.keys(row)) {
      if (k.toLowerCase() === field.toLowerCase()) {
        return String(row[k] ?? '').trim();
      }
    }
    return '';
  }

  private parseEnum(value: string, allowed: string[]): string | null {
    if (!value) return null;
    const upper = value.toUpperCase().trim();
    return allowed.includes(upper) ? upper : null;
  }
}
