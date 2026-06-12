import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { JourneyKind } from '@prisma/client';

export class TemplateTaskDto {
  @IsString()
  @MaxLength(300)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  responsible?: string;

  @IsOptional()
  @IsInt()
  offsetDays?: number;
}

export class CreateTemplateDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsEnum(JourneyKind)
  kind?: JourneyKind;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TemplateTaskDto)
  tasks!: TemplateTaskDto[];
}
