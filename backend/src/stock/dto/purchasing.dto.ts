import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, IsDateString,
  Min, MaxLength, ValidateNested,
} from 'class-validator';

export class PoLineDto {
  @IsUUID() itemId!: string;
  @IsNumber() @Min(0.01) quantityOrdered!: number;
  @IsNumber() @Min(0) unitCostHt!: number;
}

export class CreatePoDto {
  @IsUUID() supplierId!: string;
  @IsUUID() locationId!: string; // emplacement de livraison
  @IsOptional() @IsDateString() orderDate?: string;
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PoLineDto)
  lines!: PoLineDto[];
}

// Reception : quantites recues par ligne (id de ligne -> quantite).
export class ReceiveLineDto {
  @IsUUID() lineId!: string;
  @IsNumber() @Min(0) quantityReceived!: number; // quantite recue lors de CETTE reception
}
export class ReceivePoDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ReceiveLineDto)
  lines!: ReceiveLineDto[];
}
