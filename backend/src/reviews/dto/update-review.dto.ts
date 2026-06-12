import { IsEnum, IsInt, IsOptional, IsString, IsDateString, Max, MaxLength, Min } from 'class-validator';
import { ReviewStatus, ReviewType } from '@prisma/client';

export class UpdateReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  employeeNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  managerNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  summary?: string;

  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;

  @IsOptional()
  @IsEnum(ReviewType)
  type?: ReviewType;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}
