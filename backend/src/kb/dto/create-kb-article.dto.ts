import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { KbScope } from '@prisma/client';

export class CreateKbArticleDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  title!: string;

  @IsString()
  // 64 KB de markdown — un article qui depasse devrait etre splitte.
  @MaxLength(65_536)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @IsOptional()
  @IsEnum(KbScope)
  scope?: KbScope;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsUUID()
  sourceTicketId?: string;
}
