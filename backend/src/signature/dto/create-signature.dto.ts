import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSignatureDto {
  @IsString()
  @IsIn(['Quote', 'Contract'])
  entityType!: 'Quote' | 'Contract';

  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @IsOptional()
  @IsString()
  signerName?: string;

  @IsOptional()
  @IsEmail()
  signerEmail?: string;

  @IsOptional()
  @IsString()
  signerPhone?: string;

  @IsOptional()
  @IsString()
  message?: string;
}
