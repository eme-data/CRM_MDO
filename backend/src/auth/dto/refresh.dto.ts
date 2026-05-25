import { IsOptional, IsString } from 'class-validator';

// refreshToken : optionnel cote DTO car le controller accepte aussi le cookie
// httpOnly mdo_refresh (migration cookie-based auth). Validation finale dans
// AuthController.refresh : si ni body ni cookie, retour 400.
export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
