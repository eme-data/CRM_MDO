// Resultat normalise d'un lookup annuaire entreprises, partage par les
// providers (recherche-entreprises / Sirene) et le service.
export interface CompanyLookupResult {
  source: 'sirene' | 'recherche-entreprises';
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
