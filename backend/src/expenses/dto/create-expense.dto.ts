import { IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateExpenseDto {
  @IsString()
  categoryId!: string;

  @IsDateString()
  date!: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  merchant?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amountTtc!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  vatAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}
