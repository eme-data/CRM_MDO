import { Injectable, Logger } from '@nestjs/common';
import { CompanyLookupResult } from './pappers.provider';

// Provider "Recherche d'entreprises" — API officielle gratuite de l'Etat
// (DINUM / api.gouv.fr), celle qui alimente l'Annuaire des Entreprises.
//
//   - GRATUITE et SANS CLE API (aucune inscription, aucun quota payant).
//   - Donnees : denomination, SIREN/SIRET, adresse siege, NAF, forme juridique,
//     tranche d'effectif, date de creation, dirigeants.
//   - Alternative gratuite a Pappers pour un usage CRM (pre-remplissage fiche).
//
// Doc : https://recherche-entreprises.api.gouv.fr/docs/
//
// Toujours "enabled" : c'est le filet par defaut quand aucune cle Pappers/Sirene
// n'est configuree -> le lookup societe fonctionne sans aucune config.

@Injectable()
export class RechercheEntreprisesProvider {
  private readonly logger = new Logger(RechercheEntreprisesProvider.name);
  private readonly base = 'https://recherche-entreprises.api.gouv.fr';

  // Pas de cle a configurer : toujours disponible.
  async isEnabled(_tenantId: string | null = null): Promise<boolean> {
    return true;
  }

  async search(query: string, limit = 10, _tenantId: string | null = null): Promise<CompanyLookupResult[]> {
    const url =
      this.base +
      '/search?q=' +
      encodeURIComponent(query) +
      '&page=1&per_page=' +
      Math.min(limit, 25);
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        // Autocomplete UI : au-dela de 8s l'utilisateur a deja tape autre chose.
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        this.logger.warn('Recherche-entreprises HTTP ' + res.status + ' ' + res.statusText);
        return [];
      }
      const data: any = await res.json();
      const items = data.results ?? [];
      return items.map((r: any) => this.mapItem(r));
    } catch (err: any) {
      this.logger.error('Recherche-entreprises search error: ' + err.message);
      return [];
    }
  }

  async getBySiren(siren: string, tenantId: string | null = null): Promise<CompanyLookupResult | null> {
    const list = await this.search(siren, 5, tenantId);
    // L'API fait du plein-texte : on retient la correspondance exacte du SIREN.
    return list.find((r) => r.siren === siren) ?? list[0] ?? null;
  }

  private mapItem(r: any): CompanyLookupResult {
    const siege = r.siege ?? {};
    return {
      source: 'recherche-entreprises',
      name: r.nom_raison_sociale ?? r.nom_complet ?? '(Sans nom)',
      siren: r.siren,
      siret: siege.siret ?? null,
      apeCode: siege.activite_principale ?? r.activite_principale ?? null,
      // L'API ne renvoie pas le libelle NAF de maniere fiable -> null.
      apeLabel: null,
      legalForm: this.legalFormFromCode(r.nature_juridique),
      creationDate: r.date_creation ?? null,
      // Capital social non expose par cette API.
      capitalSocial: null,
      address: this.formatAddress(siege),
      postalCode: siege.code_postal ?? null,
      city: siege.libelle_commune ?? null,
      employees: this.parseTranche(r.tranche_effectif_salarie ?? siege.tranche_effectif_salarie),
    };
  }

  // Adresse = voie uniquement (CP + ville sont des champs separes), aligne sur
  // les providers Pappers/Sirene.
  private formatAddress(siege: any): string | null {
    if (!siege) return null;
    const parts = [siege.numero_voie, siege.type_voie, siege.libelle_voie].filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
    // Fallback : adresse complete brute si les champs de voie sont absents.
    return siege.adresse ?? null;
  }

  // Tranches d'effectif INSEE (memes codes que l'API Sirene).
  private parseTranche(code: string | null | undefined): number | null {
    if (!code) return null;
    const map: Record<string, number> = {
      '00': 0, '01': 1, '02': 3, '03': 6, '11': 10, '12': 20,
      '21': 50, '22': 100, '31': 200, '32': 250, '41': 500, '42': 1000,
      '51': 2000, '52': 5000, '53': 10000,
    };
    return map[code] ?? null;
  }

  // Categorie juridique INSEE -> libelle (mapping minimal des plus frequentes).
  private legalFormFromCode(code: string | null | undefined): string | null {
    if (!code) return null;
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
}
