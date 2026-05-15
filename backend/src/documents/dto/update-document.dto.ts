import {
  IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, MaxLength,
} from 'class-validator';
import { DocumentCategory } from '@prisma/client';

// Update : modifie SEULEMENT les metadata (titre, categorie, expiration,
// visibilite). Le fichier physique n'est pas modifiable — pour changer le
// fichier, supprimer et reuploader (preserve l'integrite des hashes / audit).
export class UpdateDocumentDto {
  @IsOptional() @IsString() @MaxLength(200)
  title?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  // Format ISO ou null pour effacer la date d'expiration.
  @IsOptional() @IsISO8601()
  expiresAt?: string | null;

  @IsOptional() @IsBoolean()
  visibleToClient?: boolean;
}
