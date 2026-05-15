import {
  IsArray, IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, IsUrl, MaxLength,
} from 'class-validator';
import { SubprocessorRole, DataTransferMechanism } from '@prisma/client';

// DTO unique pour create + update (les champs sont identiques, l'update les
// rend tous optionnels via PartialType, cf UpdateSubprocessorDto). On garde
// une whitelist stricte parce que ces enregistrements alimentent le registre
// RGPD du client (audit CNIL) — pas de mass-assignment toleree.
export class UpsertSubprocessorDto {
  @IsString() @MaxLength(200)
  name!: string;

  @IsOptional() @IsString() @MaxLength(200)
  legalEntity?: string;

  @IsEnum(SubprocessorRole)
  role!: SubprocessorRole;

  @IsString() @MaxLength(2000)
  purpose!: string;

  @IsArray() @IsString({ each: true })
  dataCategories!: string[];

  @IsOptional() @IsString() @MaxLength(100)
  hostingCountry?: string;

  @IsOptional() @IsString() @MaxLength(200)
  headquarters?: string;

  @IsOptional() @IsBoolean()
  transfersOutsideEu?: boolean;

  @IsOptional() @IsEnum(DataTransferMechanism)
  transferMechanism?: DataTransferMechanism;

  @IsOptional() @IsUrl({ require_tld: false }) @MaxLength(500)
  dpaUrl?: string;

  @IsOptional() @IsISO8601()
  dpaSignedAt?: string | null;

  @IsOptional() @IsUrl({ require_tld: false }) @MaxLength(500)
  vendorSubprocessorListUrl?: string;

  @IsOptional() @IsISO8601()
  startedAt?: string;

  @IsOptional() @IsISO8601()
  endedAt?: string | null;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}
