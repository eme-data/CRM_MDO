import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// DTO de pagination reutilisable. Limites :
//  - page : 1-based pour rester lisible dans l'URL (?page=1)
//  - pageSize : borne dure a 500 pour eviter qu'un appel `?pageSize=10000`
//    bloque l'event loop sur de grosses tables. 500 couvre le cas d'usage
//    "alimenter un selecteur companies/contacts dans un formulaire" sans
//    devoir paginer cote frontend (l'utilisateur prefere voir tous ses
//    clients dans un select unique).
export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number = 50;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function toSkipTake(
  dto: { page?: number; pageSize?: number } | undefined,
): { skip: number; take: number; page: number; pageSize: number } {
  const page = Math.max(1, dto?.page ?? 1);
  const pageSize = Math.min(500, Math.max(1, dto?.pageSize ?? 50));
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

export function buildPageResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PageResult<T> {
  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}
