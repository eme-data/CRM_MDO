import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLeaveDto {
  @IsString()
  typeId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsBoolean()
  halfStart?: boolean;

  @IsOptional()
  @IsBoolean()
  halfEnd?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
