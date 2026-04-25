import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddMessageDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;

  // Liste d'IDs d'attachments deja uploades a relier au message
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentIds?: string[];

  // CC / BCC pour l'email sortant (texte libre, separe par virgules)
  @IsOptional()
  @IsString()
  cc?: string;

  @IsOptional()
  @IsString()
  bcc?: string;
}
