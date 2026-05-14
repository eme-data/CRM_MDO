import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// Ligne de facture (input cote API). Pas de TVA par ligne : le taux global
// est porte par PushInvoiceDto.vatRate (cas standard FR pour un MSP).
export class InvoiceLineInputDto {
  @IsString()
  @MaxLength(500)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPriceHt!: number;
}

// Push manuel d'une facture vers Sellsy/Qonto (cas devis ponctuel, complement
// hors-contrat, etc.). Le ValidationPipe global (whitelist + forbidNonWhitelisted
// + transform) rejette les payloads malformes avec un 400 propre, plutot que
// de laisser passer des champs inattendus jusqu'a l'appel API du provider.
export class PushInvoiceDto {
  @IsUUID()
  companyId!: string;

  @IsOptional()
  @IsUUID()
  contractId?: string;

  // @Type(() => Date) force class-transformer a convertir la string ISO -> Date.
  // Le service pushInvoiceNow attend des Date, on les fournit deja typees.
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  issueDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date;

  // TVA en %. Borne 0-100 pour eviter des saisies absurdes (ex. 2000%).
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  // 100 lignes max : largement au-dessus d'un usage normal MSP, mais protege
  // contre un payload accidentellement enorme qui ferait timeout l'API Sellsy.
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineInputDto)
  lines!: InvoiceLineInputDto[];
}
