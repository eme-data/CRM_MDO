import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BackupRunStatus, BackupSourceType } from '@prisma/client';

export class CreateBackupJobDto {
  @IsUUID()
  companyId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  vendor?: string;

  @IsOptional()
  @IsEnum(BackupSourceType)
  sourceType?: BackupSourceType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceIdentifier?: string;

  // Frequence attendue : 1h..30j (en heures). Defaut : 26h (laisse 2h marge
  // sur un backup quotidien).
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  expectedFrequencyHours?: number;
}

export class UpdateBackupJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  vendor?: string | null;

  @IsOptional()
  @IsEnum(BackupSourceType)
  sourceType?: BackupSourceType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceIdentifier?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  expectedFrequencyHours?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class RecordBackupRunDto {
  @IsEnum(BackupRunStatus)
  status!: BackupRunStatus;

  @IsDateString()
  startedAt!: string;

  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSec?: number;

  // sizeBytes peut depasser 2^31 (backup > 2 GB), donc on accepte Number qui
  // supporte jusqu'a 2^53 — Prisma BigInt deserialise via coercition cote
  // service. Pas de validation @IsInt qui rejette les flottants > MAX_SAFE.
  @IsOptional()
  sizeBytes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  itemsCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalRunId?: string;

  @IsOptional()
  rawPayload?: any;
}
