import { IsOptional, IsString, IsUUID, IsDateString, MaxLength } from 'class-validator';

export class CreateObjectiveDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsUUID()
  reviewId?: string;
}
