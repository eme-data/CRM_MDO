import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CompanySector, CompanyStatus } from '@prisma/client';
import { PaginationDto } from '../../common/pagination/pagination.dto';

// Hérite de PaginationDto (page, pageSize bornes 1-200) pour partager la
// validation et la cap dure du pageSize avec les autres ressources.
// On override le pageSize par defaut a 25 (vs 50 dans PaginationDto) car
// les Companies sont retournees avec _count.contacts/contracts/opportunities
// + l'owner inclus → cargo plus lourd par item, on prefere des pages plus
// courtes.
export class QueryCompaniesDto extends PaginationDto {
  pageSize?: number = 25;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;

  @IsOptional()
  @IsEnum(CompanySector)
  sector?: CompanySector;

  @IsOptional()
  @IsString()
  ownerId?: string;
}
