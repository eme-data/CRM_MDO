import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSecretDto {
  @IsString() @IsNotEmpty() companyId!: string;
  @IsString() @IsNotEmpty() label!: string;
  @IsOptional() @IsString() username?: string;
  @IsString() @IsNotEmpty() value!: string;
  @IsOptional() @IsString() url?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() notes?: string;
}
