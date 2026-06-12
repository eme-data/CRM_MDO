import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ContractType } from '@prisma/client';

// Tous les champs optionnels (PATCH partiel). Le service filtre selon le role :
// un collaborateur ne peut editer que ses coordonnees ; RH/manager edite tout.
export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(120) jobTitle?: string;
  @IsOptional() @IsString() @MaxLength(120) department?: string;
  @IsOptional() @IsString() managerId?: string | null;
  @IsOptional() @IsEnum(ContractType) contractType?: ContractType;
  @IsOptional() @IsDateString() hireDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(40) mobile?: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string;
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(80) country?: string;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsString() @MaxLength(120) emergencyContactName?: string;
  @IsOptional() @IsString() @MaxLength(40) emergencyContactPhone?: string;
  @IsOptional() @IsString() @MaxLength(40) iban?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
