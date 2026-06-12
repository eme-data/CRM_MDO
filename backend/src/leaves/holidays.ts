// Jours feries FRANCAIS (metropole) pour le decompte des conges.
//   - Fixes : 1er janvier, 1er mai, 8 mai, 14 juillet, 15 aout, 1er novembre,
//     11 novembre, 25 decembre.
//   - Mobiles (bases sur Paques) : lundi de Paques (+1), Ascension (+39),
//     lundi de Pentecote (+50).
//
// NB v2 : rendre configurable par tenant/pays (Alsace-Moselle a 2 feries de
// plus ; clients hors France auront un autre calendrier).

const cache = new Map<number, Set<string>>();

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Dimanche de Paques (gregorien) - algorithme de Meeus/Jones/Butcher.
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = mars, 4 = avril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

export function frenchHolidays(year: number): Set<string> {
  const cached = cache.get(year);
  if (cached) return cached;

  const set = new Set<string>();
  for (const mmdd of ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25']) {
    set.add(year + '-' + mmdd);
  }
  const easter = easterSunday(year);
  for (const offset of [1, 39, 50]) {
    const d = new Date(easter);
    d.setUTCDate(d.getUTCDate() + offset);
    set.add(ymd(d));
  }

  cache.set(year, set);
  return set;
}

// Union des feries sur l'intervalle [start, end] (peut chevaucher 2 annees).
export function frenchHolidaysForRange(start: Date, end: Date): Set<string> {
  const set = new Set<string>();
  for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y++) {
    for (const h of frenchHolidays(y)) set.add(h);
  }
  return set;
}
