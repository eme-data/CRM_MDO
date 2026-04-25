import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CompanySector } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PappersProvider, CompanyLookupResult } from './pappers.provider';
import { SireneProvider } from './sirene.provider';

@Injectable()
export class CompanyLookupService {
  private readonly logger = new Logger(CompanyLookupService.name);

  constructor(
    private readonly pappers: PappersProvider,
    private readonly sirene: SireneProvider,
    private readonly prisma: PrismaService,
  ) {}

  hasAnyProvider(): boolean {
    return this.pappers.isEnabled() || this.sirene.isEnabled();
  }

  async search(query: string): Promise<CompanyLookupResult[]> {
    if (!query || query.trim().length < 3) return [];
    if (!this.hasAnyProvider()) {
      throw new ServiceUnavailableException(
        'Aucun provider configure : ajoutez PAPPERS_API_KEY ou SIRENE_API_KEY dans .env',
      );
    }
    // Pappers en priorite si configure, fallback Sirene
    if (this.pappers.isEnabled()) {
      const results = await this.pappers.search(query.trim(), 10);
      if (results.length > 0) return results;
    }
    if (this.sirene.isEnabled()) {
      return this.sirene.search(query.trim(), 10);
    }
    return [];
  }

  async getBySiren(siren: string): Promise<CompanyLookupResult> {
    const cleaned = siren.replace(/\s/g, '');
    if (!/^\d{9}$/.test(cleaned)) {
      throw new NotFoundException('SIREN invalide (9 chiffres attendus)');
    }
    if (this.pappers.isEnabled()) {
      const r = await this.pappers.getBySiren(cleaned);
      if (r) return r;
    }
    if (this.sirene.isEnabled()) {
      const r = await this.sirene.getBySiren(cleaned);
      if (r) return r;
    }
    throw new NotFoundException('Aucune entreprise trouvee pour SIREN ' + cleaned);
  }

  async refreshCompany(companyId: string, userId: string): Promise<any> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Societe introuvable');
    const siren = company.siren ?? this.sirenFromSiret(company.siret);
    if (!siren) {
      throw new NotFoundException(
        'Pas de SIREN/SIRET sur cette societe - impossible de rafraichir depuis le registre',
      );
    }
    const remote = await this.getBySiren(siren);
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        siren: remote.siren,
        siret: remote.siret ?? company.siret,
        apeCode: remote.apeCode,
        apeLabel: remote.apeLabel,
        legalForm: remote.legalForm,
        creationDate: remote.creationDate ? new Date(remote.creationDate) : null,
        capitalSocial: remote.capitalSocial,
        // On NE remplace PAS name/address/etc s'ils ne sont pas vides cote CRM
        name: company.name || remote.name,
        address: company.address || remote.address,
        postalCode: company.postalCode || remote.postalCode,
        city: company.city || remote.city,
        employees: company.employees ?? remote.employees,
        sector: company.sector || this.guessSector(remote.apeCode),
        lastSyncedAt: new Date(),
      },
    });
    await this.prisma.activity.create({
      data: {
        userId,
        action: 'SYNC_REGISTRY',
        entity: 'Company',
        entityId: companyId,
        metadata: { source: remote.source, siren: remote.siren },
      },
    });
    return updated;
  }

  // Mapper code APE -> CompanySector enum
  guessSector(apeCode: string | null | undefined): CompanySector {
    if (!apeCode) return 'PME';
    const ape = apeCode.replace(/[^0-9]/g, '');
    const div = parseInt(ape.substring(0, 2), 10);
    if (Number.isNaN(div)) return 'PME';
    if (div >= 10 && div <= 33) return 'INDUSTRIE';
    if (div >= 84 && div <= 84) return 'COLLECTIVITE';
    if (div >= 85 && div <= 85) return 'EDUCATION';
    if (div >= 86 && div <= 88) return 'SANTE';
    if (div >= 94 && div <= 94) return 'ASSOCIATION';
    return 'PME';
  }

  private sirenFromSiret(siret: string | null): string | null {
    if (!siret) return null;
    const cleaned = siret.replace(/\s/g, '');
    return /^\d{14}$/.test(cleaned) ? cleaned.substring(0, 9) : null;
  }
}
