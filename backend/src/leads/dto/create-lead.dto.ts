import { Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

// Form public d'acquisition. Anti-spam : honeypot + rate-limit + validation
// stricte. Le champ `website` est un honeypot — un humain ne le voit pas
// (CSS display:none cote front), un bot remplit tout par defaut → on rejette.
export class CreateLeadDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsString()
  @Length(10, 4000)
  message!: string;

  // Source du lead : "website", "salon", "referral", etc. Default "website".
  @IsOptional()
  @IsString()
  @MaxLength(60)
  source?: string;

  // HONEYPOT : doit etre vide. Si rempli = bot detecte. Le champ existe
  // dans le DTO juste pour qu'on puisse le valider via @Length(0, 0). On
  // reject avec un 200 muet cote controller pour ne pas signaler la detection.
  @IsOptional()
  @IsString()
  @Length(0, 0, { message: 'Honeypot non vide' })
  website?: string;
}
