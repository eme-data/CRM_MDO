// Normalisation FR -> E.164. Pas une lib lourde (libphonenumber pesait ~500ko)
// car 99 % de nos numeros sont francais. Si besoin futur d'international,
// remplacer par google-libphonenumber.

const FR_COUNTRY_CODE = '33';

/**
 * Normalise un numero francais vers E.164 (+33XXXXXXXXX).
 * - "06 12 34 56 78"   -> "+33612345678"
 * - "+33 6 12 34 56 78" -> "+33612345678"
 * - "0033612345678"    -> "+33612345678"
 * - numero deja E.164 international (+44...) -> retourne tel quel (apres trim)
 *
 * Retourne null si le numero ne ressemble a rien d'exploitable.
 */
export function normalizePhoneFR(input: string | null | undefined): string | null {
  if (!input) return null;
  // Supprime tous les separateurs courants
  let s = input.replace(/[\s.\-()/]/g, '');
  if (s.length === 0) return null;

  // Format international deja correct
  if (s.startsWith('+')) {
    return /^\+\d{8,15}$/.test(s) ? s : null;
  }
  // 00 prefix international
  if (s.startsWith('00')) {
    s = '+' + s.slice(2);
    return /^\+\d{8,15}$/.test(s) ? s : null;
  }
  // Format national francais 0X XX XX XX XX
  if (/^0\d{9}$/.test(s)) {
    return '+' + FR_COUNTRY_CODE + s.slice(1);
  }
  // Sans le 0 initial mais avec 9 chiffres
  if (/^\d{9}$/.test(s)) {
    return '+' + FR_COUNTRY_CODE + s;
  }
  return null;
}

/**
 * Variantes equivalentes d'un meme numero pour le matching DB.
 * Si on stocke "06 12 34 56 78" en DB et qu'un appel arrive avec "+33612345678",
 * on doit pouvoir matcher. On genere donc plusieurs candidats a comparer.
 */
export function phoneSearchVariants(normalized: string): string[] {
  const variants = new Set<string>([normalized]);
  // Si c'est un numero FR, generer aussi le format national
  if (normalized.startsWith('+' + FR_COUNTRY_CODE)) {
    const national = '0' + normalized.slice(3);
    variants.add(national);
    // Avec espaces tous les 2 chiffres
    variants.add(national.replace(/(\d{2})(?=\d)/g, '$1 ').trim());
    // Avec points
    variants.add(national.replace(/(\d{2})(?=\d)/g, '$1.').replace(/\.$/, ''));
  }
  return Array.from(variants);
}
