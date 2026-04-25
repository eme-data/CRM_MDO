import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { CompanyLookupResult } from './pappers.provider';

@Injectable()
export class SireneProvider {
  private readonly logger = new Logger(SireneProvider.name);
  // INSEE Sirene V3.11 (recettes 2024+)
  private readonly base = 'https://api.insee.fr/api-sirene/3.11';

  constructor(private readonly settings: SettingsService) {}

  async isEnabled(): Promise<boolean> {
    return Boolean(await this.settings.get('lookup.sireneApiKey'));
  }

  async search(query: string, limit = 10): Promise<CompanyLookupResult[]> {
    const key = await this.settings.get('lookup.sireneApiKey');
    if (!key) return [];
    const isNumeric = /^\d{9,14}$/.test(query.replace(/\s/g, ''));
    const cleanedQuery = query.replace(/\s/g, '');
    let q: string;
    if (isNumeric) {
      if (cleanedQuery.length === 14) q = 'siret:' + cleanedQuery;
      else if (cleanedQuery.length === 9) q = 'siren:' + cleanedQuery;
      else q = 'denominationUniteLegale:' + this.escape(query);
    } else {
      q = 'denominationUniteLegale:' + this.escape(query) + '*';
    }
    const url =
      this.base +
      '/siret?q=' +
      encodeURIComponent(q) +
      '&nombre=' +
      limit +
      '&champs=siret,siren,denominationUniteLegale,activitePrincipaleUniteLegale,nomenclatureActivitePrincipaleUniteLegale,categorieJuridiqueUniteLegale,dateCreationUniteLegale,trancheEffectifsUniteLegale,libelleCommuneEtablissement,codePostalEtablissement,numeroVoieEtablissement,typeVoieEtablissement,libelleVoieEtablissement,etablissementSiege';
    try {
      const res = await fetch(url, {
        headers: { 'X-INSEE-Api-Key-Integration': key, Accept: 'application/json' },
      });
      if (!res.ok) {
        this.logger.warn('Sirene HTTP ' + res.status + ' ' + res.statusText);
        return [];
      }
      const data: any = await res.json();
      const ets = data.etablissements ?? [];
      return ets.map((e: any) => this.mapEtablissement(e));
    } catch (err: any) {
      this.logger.error('Sirene search error: ' + err.message);
      return [];
    }
  }

  async getBySiren(siren: string): Promise<CompanyLookupResult | null> {
    const list = await this.search(siren, 1);
    return list[0] ?? null;
  }

  private mapEtablissement(e: any): CompanyLookupResult {
    const ul = e.uniteLegale ?? {};
    const adr = e.adresseEtablissement ?? {};
    return {
      source: 'sirene',
      name:
        ul.denominationUniteLegale ??
        ul.nomUniteLegale ??
        '(Sans nom)',
      siren: e.siren ?? ul.siren,
      siret: e.siret ?? null,
      apeCode: ul.activitePrincipaleUniteLegale ?? null,
      apeLabel: null,
      legalForm: this.legalFormFromCode(ul.categorieJuridiqueUniteLegale),
      creationDate: ul.dateCreationUniteLegale ?? null,
      capitalSocial: null,
      address: this.formatAddress(adr),
      postalCode: adr.codePostalEtablissement ?? null,
      city: adr.libelleCommuneEtablissement ?? null,
      employees: this.parseTranche(ul.trancheEffectifsUniteLegale),
    };
  }

  private formatAddress(adr: any): string | null {
    if (!adr) return null;
    const parts = [
      adr.numeroVoieEtablissement,
      adr.typeVoieEtablissement,
      adr.libelleVoieEtablissement,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : null;
  }

  private parseTranche(code: string | null | undefined): number | null {
    if (!code) return null;
    // Tranches INSEE : 00=0 sal, 01=1-2, 02=3-5, 03=6-9, 11=10-19, 12=20-49, 21=50-99, 22=100-199, 31=200-249, 32=250-499, 41=500-999, 42=1000-1999, 51=2000-4999, 52=5000-9999, 53=10000+
    const map: Record<string, number> = {
      '00': 0, '01': 1, '02': 3, '03': 6, '11': 10, '12': 20,
      '21': 50, '22': 100, '31': 200, '32': 250, '41': 500, '42': 1000,
      '51': 2000, '52': 5000, '53': 10000,
    };
    return map[code] ?? null;
  }

  private legalFormFromCode(code: string | null | undefined): string | null {
    if (!code) return null;
    // Mapping minimal des categories juridiques INSEE les plus frequentes
    const map: Record<string, string> = {
      '5710': 'SAS',
      '5720': 'SASU',
      '5499': 'SARL',
      '5485': 'EURL',
      '5599': 'SA',
      '7344': 'Etablissement public',
      '7210': 'Commune',
      '9220': 'Association',
      '1000': 'Entrepreneur individuel',
    };
    return map[code] ?? code;
  }

  private escape(s: string): string {
    return s.replace(/[+\-&|!(){}[\]^"~*?:\\]/g, '\\$&');
  }
}
