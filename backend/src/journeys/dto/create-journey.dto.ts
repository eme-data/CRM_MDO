import { IsEnum, IsOptional, IsString, IsUUID, IsDateString, MaxLength } from 'class-validator';
import { JourneyKind } from '@prisma/client';

export class CreateJourneyDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsEnum(JourneyKind)
  kind?: JourneyKind;

  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;
}
