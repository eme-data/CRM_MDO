import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

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
  @IsString()
  ticketId?: string;

  @IsOptional()
  @IsString()
  interventionId?: string;

  @IsOptional()
  @IsString()
  contractId?: string;
}
