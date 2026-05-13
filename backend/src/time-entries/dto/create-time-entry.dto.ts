import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateTimeEntryDto {
  @IsDateString()
  startedAt!: string;

  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationMin?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  billable?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hourlyRateHt?: number;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  ticketId?: string;

  @IsOptional()
  @IsString()
  interventionId?: string;

  @IsOptional()
  @IsString()
  contractId?: string;
}
