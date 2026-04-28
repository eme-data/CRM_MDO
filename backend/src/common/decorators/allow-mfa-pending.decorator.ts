import { SetMetadata } from '@nestjs/common';

// Marque un controleur ou une route comme accessible meme quand l'utilisateur
// a une 2FA obligatoire mais pas encore activee. Utilisee pour /mfa/* et le
// strict minimum de /auth/* afin que l'utilisateur puisse activer sa 2FA.
export const ALLOW_MFA_PENDING_KEY = 'allowMfaPending';
export const AllowMfaPending = () => SetMetadata(ALLOW_MFA_PENDING_KEY, true);
