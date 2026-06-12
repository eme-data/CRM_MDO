import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CompanySector } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TenantScope } from '../common/tenant/tenant-scope.helper';
import { JwtUser } from '../common/decorators/current-user.decorator';
import { CompanyLookupResult } from './company-lookup.types';
import { SireneProvider } from './sirene.provider';
import { RechercheEntreprisesProvider } from './recherche-entreprises.provider';

@Injectable()
export class CompanyLookupService {
  private readonly logger = new Logger(CompanyLookupService.name);

  constructor(
    // API gouv gratuite et sans cle : toujours disponible, sert de defaut.
    private readonly rechercheEntreprises: RechercheEntreprisesProvider,
    private readonly sirene: SireneProvider,
    private readonly prisma: PrismaService,
    private readonly scope: TenantScope,
  ) {}

  async hasAnyProvider(_tenantId: string | null = null): Promise<boolean> {
    // recherche-entreprises (API gouv, gratuite, sans cle) est toujours actif
    // -> il y a toujours au moins un provider disponible.
    return true;
  }

  async search(query: string, tenantId: string | null = null): Promise<CompanyLookupResult[]> {
    if (!query || query.trim().length < 3) return [];
    const q = query.trim();
    // 1. Recherche d'entreprises (API gouv gratuite, sans cle) : source par defaut.
    const gouv = await this.rechercheEntreprises.search(q, 10, tenantId);
    if (gouv.length > 0) return gouv;
    // 2. INSEE Sirene (gratuit, avec cle) en dernier recours si configure.
    if (await this.sirene.isEnabled(tenantId)) {
      return this.sirene.search(q, 10, tenantId);
    }
    return gouv;
  }

  async getBySiren(siren: string, tenantId: string | null = null): Promise<CompanyLookupResult> {
    const cleaned = siren.replace(/\s/g, '');
    if (!/^\d{9}$/.test(cleaned)) {
      throw new NotFoundException('SIREN invalide (9 chiffres attendus)');
    }
    const gouv = await this.rechercheEntreprises.getBySiren(cleaned, tenantId);
    if (gouv) return gouv;
    if (await this.sirene.isEnabled(tenantId)) {
      const r = await this.sirene.getBySiren(cleaned, tenantId);
      if (r) return r;
    }
    throw new NotFoundException('Aucune entreprise trouvee pour SIREN ' + cleaned);
  }

  async refreshCompany(companyId: string, me: JwtUser): Promise<any> {
    await this.scope.assertCompanyInTenant(companyId, me);
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Societe introuvable');
    const siren = company.siren ?? this.sirenFromSiret(company.siret);
    if (!siren) {
      throw new NotFoundException(
        'Pas de SIREN/SIRET sur cette societe - impossible de rafraichir depuis le registre',
      );
    }
    const remote = await this.getBySiren(siren, me.tenantId);
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
        userId: me.id,
        tenantId: me.tenantId,
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
