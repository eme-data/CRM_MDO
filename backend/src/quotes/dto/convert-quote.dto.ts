import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ContractOffer } from '@prisma/client';

// Conversion d'un Quote ACCEPTED en Contract. Les valeurs commerciales
// (unitPriceHt, quantity) sont reprises depuis la 1ere ligne du devis si non
// surchargees ; tout le reste vient des params du contrat (offre, dates, etc.).
export class ConvertQuoteDto {
  @IsEnum(ContractOffer)
  offer!: ContractOffer;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  engagementMonths?: number;

  @IsOptional()
  @IsString()
  ownerId?: string;
}
