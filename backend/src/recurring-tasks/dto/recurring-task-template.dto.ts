import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RecurringFrequency, TaskPriority } from '@prisma/client';

export class CreateRecurringTaskTemplateDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @Length(2, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  // Delai entre generation et echeance (1-365 j). Defaut 7 j.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  dueDateOffsetDays?: number;

  @IsEnum(RecurringFrequency)
  frequency!: RecurringFrequency;

  // 1-28 pour eviter les pieges fevrier. Si non specifie, on prend le jour
  // de startsOn comme reference (cf helpers).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsOn?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsOn?: Date;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  contractId?: string;
}

// Update DTO : tous les champs optionnels (PATCH semantique).
export class UpdateRecurringTaskTemplateDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  dueDateOffsetDays?: number;

  @IsOptional()
  @IsEnum(RecurringFrequency)
  frequency?: RecurringFrequency;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsOn?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endsOn?: Date | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  companyId?: string | null;

  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @IsOptional()
  @IsUUID()
  contractId?: string | null;
}
