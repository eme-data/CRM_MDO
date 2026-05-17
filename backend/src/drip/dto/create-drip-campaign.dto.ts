import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DripCampaignTrigger } from '@prisma/client';

export class DripStepDto {
  // Decalage en jours apres l'enrollment. 0 = immediate, 7 = 1 semaine apres.
  @IsInt()
  @Min(0)
  dayOffset!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subject!: string;

  // 1 Mo de HTML max — un email plus gros est probablement une erreur.
  @IsString()
  @MaxLength(1_048_576)
  bodyHtml!: string;
}

export class CreateDripCampaignDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsEnum(DripCampaignTrigger)
  trigger?: DripCampaignTrigger;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DripStepDto)
  steps!: DripStepDto[];
}
