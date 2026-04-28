import { BadRequestException } from '@nestjs/common';

// Politique de mot de passe pour les nouveaux mots de passe (creation user,
// reset, change-password). Pas applique au login (sinon casse les comptes
// historiques avec d'anciens mots de passe plus courts).
//
// Regles :
//   - longueur minimale (configurable via setting `auth.passwordMinLength`,
//     defaut 12)
//   - presence d'au moins 3 des 4 classes : minuscule / majuscule / chiffre /
//     symbole. Plus permissif qu'une exigence stricte des 4, mais bloque les
//     mots de passe trivialement faibles ("Password1234" reste accepte, c'est
//     deja mieux qu'aujourd'hui).
//   - rejette les mots de passe commun-suspects evidents (liste minimale, pas
//     une dictionnary attack — pour ca il faudrait zxcvbn cote CI uniquement).

const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  'azertyuiop',
  'qwertyuiop',
  '123456789',
  '123456789012',
  'motdepasse',
  'mdoservices',
  'changeme',
  'admin1234',
  'administrator',
]);

export function assertStrongPassword(password: string, minLength = 12): void {
  if (typeof password !== 'string') {
    throw new BadRequestException('Mot de passe invalide');
  }
  if (password.length < minLength) {
    throw new BadRequestException(
      `Mot de passe trop court (minimum ${minLength} caracteres)`,
    );
  }
  if (password.length > 256) {
    throw new BadRequestException('Mot de passe trop long (maximum 256 caracteres)');
  }
  const lower = /[a-z]/.test(password);
  const upper = /[A-Z]/.test(password);
  const digit = /[0-9]/.test(password);
  const symbol = /[^A-Za-z0-9]/.test(password);
  const classes = [lower, upper, digit, symbol].filter(Boolean).length;
  if (classes < 3) {
    throw new BadRequestException(
      'Mot de passe trop faible : doit contenir au moins 3 des 4 classes (minuscules, majuscules, chiffres, symboles)',
    );
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new BadRequestException('Mot de passe trop commun, choisissez-en un autre');
  }
}
