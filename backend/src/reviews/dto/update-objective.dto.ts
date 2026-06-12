import { IsEnum, IsInt, IsOptional, IsString, IsDateString, Max, MaxLength, Min } from 'class-validator';
import { ObjectiveStatus } from '@prisma/client';

export class UpdateObjectiveDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(ObjectiveStatus)
  status?: ObjectiveStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
