import {
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
import { CustomerSuccessReviewStatus } from '@prisma/client';

export class CreateCustomerSuccessReviewDto {
  @IsUUID()
  companyId!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsUUID()
  ownerId?: string;
}

export class UpdateCustomerSuccessReviewDto {
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsEnum(CustomerSuccessReviewStatus)
  status?: CustomerSuccessReviewStatus;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  satisfactionScore?: number | null;

  @IsOptional()
  @IsUUID()
  ownerId?: string | null;
}
