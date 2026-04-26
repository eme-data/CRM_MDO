import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSecretDto {
  @IsString() @IsNotEmpty() companyId!: string;
  @IsString() @IsNotEmpty() label!: string;
  @IsOptional() @IsString() username?: string;
  @IsString() @IsNotEmpty() value!: string;
  @IsOptional() @IsString() url?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() notes?: string;
  // Secret TOTP (base32) optionnel pour generer les codes 2FA partages
  // (admin firewall, M365 break-glass, etc.). Si renseigne, le code sera
  // genere a la volee a chaque reveal. Format : "JBSWY3DPEHPK3PXP" ou
  // "otpauth://totp/...?secret=XXX" (l'extraction se fait dans le service).
  @IsOptional() @IsString() totpSecret?: string;
}
