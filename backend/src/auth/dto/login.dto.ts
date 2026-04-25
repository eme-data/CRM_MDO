import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Email invalide' })
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Mot de passe trop court' })
  password!: string;

  @IsOptional()
  @IsString()
  totpCode?: string;
}
