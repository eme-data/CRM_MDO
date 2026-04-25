import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

export interface CompanyLookupResult {
  source: 'pappers' | 'sirene';
  name: string;
  siren: string;
  siret?: string | null;
  apeCode?: string | null;
  apeLabel?: string | null;
  legalForm?: string | null;
  creationDate?: string | null;
  capitalSocial?: number | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  employees?: number | null;
}

@Injectable()
export class PappersProvider {
  private readonly logger = new Logger(PappersProvider.name);
  private readonly base = 'https://api.pappers.fr/v2';

  constructor(private readonly settings: SettingsService) {}

  async isEnabled(): Promise<boolean> {
    return Boolean(await this.settings.get('lookup.pappersApiKey'));
  }

  async search(query: string, limit = 10): Promise<CompanyLookupResult[]> {
    const key = await this.settings.get('lookup.pappersApiKey');
    if (!key) return [];
    const url =
      this.base +
      '/recherche?api_token=' +
      encodeURIComponent(key) +
      '&q=' +
      encodeURIComponent(query) +
      '&precision=standard&page=1&par_page=' +
      limit;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn('Pappers search HTTP ' + res.status + ' ' + res.statusText);
        return [];
      }
      const data: any = await res.json();
      const items = data.resultats ?? [];
      return items.map((r: any) => this.mapItem(r));
    } catch (err: any) {
      this.logger.error('Pappers search error: ' + err.message);
      return [];
    }
  }

  async getBySiren(siren: string): Promise<CompanyLookupResult | null> {
    const key = await this.settings.get('lookup.pappersApiKey');
    if (!key) return null;
    const url =
      this.base + '/entreprise?api_token=' + encodeURIComponent(key) + '&siren=' + encodeURIComponent(siren);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn('Pappers detail HTTP ' + res.status);
        return null;
      }
      const data: any = await res.json();
      return this.mapDetail(data);
    } catch (err: any) {
      this.logger.error('Pappers detail error: ' + err.message);
      return null;
    }
  }

  private mapItem(r: any): CompanyLookupResult {
    const siege = r.siege ?? {};
    return {
      source: 'pappers',
      name: r.nom_entreprise ?? r.denomination ?? '(Sans nom)',
      siren: r.siren,
      siret: siege.siret ?? null,
      apeCode: r.code_naf ?? r.activite_principale?.code ?? null,
      apeLabel: r.libelle_code_naf ?? r.activite_principale?.libelle ?? null,
      legalForm: r.forme_juridique ?? null,
      creationDate: r.date_creation ?? null,
      capitalSocial: r.capital ? Number(r.capital) : null,
      address: this.formatAddress(siege),
      postalCode: siege.code_postal ?? null,
      city: siege.ville ?? null,
      employees: r.effectif ? this.parseEffectif(r.effectif) : null,
    };
  }

  private mapDetail(d: any): CompanyLookupResult {
    const siege = d.siege ?? d.etablissement_siege ?? {};
    return {
      source: 'pappers',
      name: d.nom_entreprise ?? d.denomination ?? '(Sans nom)',
      siren: d.siren,
      siret: siege.siret ?? d.siret_siege ?? null,
      apeCode: d.code_naf ?? null,
      apeLabel: d.libelle_code_naf ?? null,
      legalForm: d.forme_juridique ?? null,
      creationDate: d.date_creation ?? null,
      capitalSocial: d.capital ? Number(d.capital) : null,
      address: this.formatAddress(siege),
      postalCode: siege.code_postal ?? null,
      city: siege.ville ?? null,
      employees: d.effectif ? this.parseEffectif(d.effectif) : null,
    };
  }

  private formatAddress(siege: any): string | null {
    if (!siege) return null;
    const parts = [
      siege.numero_voie,
      siege.type_voie,
      siege.libelle_voie,
      siege.complement_adresse,
    ].filter(Boolean);
    if (parts.length === 0 && siege.adresse_ligne_1) return siege.adresse_ligne_1;
    return parts.length > 0 ? parts.join(' ') : null;
  }

  private parseEffectif(eff: string | number): number | null {
    if (typeof eff === 'number') return eff;
    // Pappers renvoie souvent une tranche : "10 a 19", "100 a 199"
    const m = String(eff).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }
}
