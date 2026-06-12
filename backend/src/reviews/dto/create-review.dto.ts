import { IsEnum, IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';
import { ReviewType } from '@prisma/client';

export class CreateReviewDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsEnum(ReviewType)
  type?: ReviewType;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  managerNotes?: string;
}
