import {
  IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MaxLength,
} from 'class-validator';
import { StockMovementType, StockSerialStatus } from '@prisma/client';

// ---------- Articles ----------
export class CreateItemDto {
  @IsString() @MaxLength(60) sku!: string;
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsNumber() @Min(0) reorderPoint?: number;
  @IsOptional() @IsNumber() @Min(0) avgCostHt?: number;
  @IsOptional() @IsBoolean() trackSerial?: boolean;
}

export class UpdateItemDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsUUID() productId?: string | null;
  @IsOptional() @IsUUID() supplierId?: string | null;
  @IsOptional() @IsNumber() @Min(0) reorderPoint?: number;
  @IsOptional() @IsBoolean() trackSerial?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

// ---------- Mouvements ----------
export class MovementDto {
  @IsUUID() itemId!: string;
  @IsUUID() locationId!: string;
  @IsEnum(StockMovementType) type!: StockMovementType; // IN ou OUT (TRANSFER/ADJUSTMENT ont leurs endpoints)
  @IsNumber() @Min(0.01) quantity!: number;
  @IsOptional() @IsNumber() @Min(0) unitCostHt?: number; // cout d'entree (IN) ; sinon PMP courant
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
  @IsOptional() @IsString() @MaxLength(40) refType?: string;
  @IsOptional() @IsString() @MaxLength(60) refId?: string;
}

export class TransferDto {
  @IsUUID() itemId!: string;
  @IsUUID() fromLocationId!: string;
  @IsUUID() toLocationId!: string;
  @IsNumber() @Min(0.01) quantity!: number;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class AdjustDto {
  @IsUUID() itemId!: string;
  @IsUUID() locationId!: string;
  @IsNumber() @Min(0) countedQuantity!: number; // quantite reelle constatee
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

// ---------- Fournisseurs ----------
export class CreateSupplierDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
export class UpdateSupplierDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

// ---------- Emplacements ----------
export class CreateLocationDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}
export class UpdateLocationDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

// ---------- Numeros de serie ----------
export class CreateSerialDto {
  @IsUUID() itemId!: string;
  @IsString() @MaxLength(120) serial!: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
export class UpdateSerialDto {
  @IsOptional() @IsEnum(StockSerialStatus) status?: StockSerialStatus;
  @IsOptional() @IsUUID() locationId?: string | null;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
