import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsISO8601, IsNumber, IsOptional, IsString,
  IsUUID, MaxLength, Min, ValidateNested,
} from 'class-validator';

// Ligne de facture : description libre + quantite + prix unitaire HT.
// Le total est calcule cote service (line.quantity * line.unitPriceHt).
export class CreateInvoiceLineDto {
  @IsString() @MaxLength(500)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Type(() => Number)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  unitPriceHt!: number;

  // Lien optionnel a un article de stock (decrement a l'emission de la facture).
  @IsOptional() @IsUUID()
  stockItemId?: string;
}

export class CreateInvoiceDto {
  @IsUUID()
  companyId!: string;

  @IsOptional() @IsUUID()
  contractId?: string;

  @IsOptional() @IsISO8601()
  issueDate?: string;

  @IsOptional() @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  vatRate?: number;

  @IsArray() @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  lines!: CreateInvoiceLineDto[];

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}
