import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ContractStatus } from '@prisma/client';
import { PaginationDto } from '../../common/pagination/pagination.dto';

// Filtres + pagination pour GET /contracts. Herite de PaginationDto pour
// partager les bornes (page>=1, pageSize 1-200).
export class QueryContractsDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @IsOptional()
  @IsString()
  companyId?: string;

  // Filtre "expirant dans N jours" : raccourci pour le dashboard et les
  // alertes. Borne 1-365 pour rester dans les usages metier raisonnables.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  expiringInDays?: number;
}
