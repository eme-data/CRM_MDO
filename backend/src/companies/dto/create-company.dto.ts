import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';
import { CompanySector, CompanyStatus } from '@prisma/client';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  siret?: string;

  @IsOptional()
  @IsString()
  siren?: string;

  @IsOptional()
  @IsString()
  apeCode?: string;

  @IsOptional()
  @IsString()
  apeLabel?: string;

  @IsOptional()
  @IsString()
  legalForm?: string;

  @IsOptional()
  @IsDateString()
  creationDate?: string;

  @IsOptional()
  @IsNumber()
  capitalSocial?: number;

  @IsOptional()
  @IsEnum(CompanySector)
  sector?: CompanySector;

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  employees?: number;

  @IsOptional()
  @IsUrl({ require_protocol: false })
  website?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;
}
