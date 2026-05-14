import { RecurringFrequency } from '@prisma/client';

// Calcul du prochain horodatage de generation depuis une date de reference et
// une frequence. Fonction PURE pour permettre tests unitaires sans Prisma.
//
// Regles :
//   - WEEKLY : +7 jours par rapport a `from`
//   - MONTHLY : meme jour le mois suivant, ou dayOfMonth si specifie.
//     Si dayOfMonth depasse le nombre de jours du mois cible (ex. 31 en
//     fevrier), on prend le dernier jour du mois.
//   - QUARTERLY : +3 mois (meme logique de clamping pour dayOfMonth)
//   - YEARLY : +12 mois
//
// L'heure est toujours fixee a 06:00 Europe/Paris pour rester avant que les
// utilisateurs ne consultent leur planning (cron quotidien tourne a 06:30).
export function computeNextRunAt(
  from: Date,
  frequency: RecurringFrequency,
  dayOfMonth: number | null,
): Date {
  const next = new Date(from);
  next.setHours(6, 0, 0, 0);

  switch (frequency) {
    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      return next;
    case 'MONTHLY':
      return addMonthsClamped(next, 1, dayOfMonth);
    case 'QUARTERLY':
      return addMonthsClamped(next, 3, dayOfMonth);
    case 'YEARLY':
      return addMonthsClamped(next, 12, dayOfMonth);
    default:
      // Garde-fou : si une nouvelle valeur d'enum est ajoutee sans MAJ ici,
      // on revient a un comportement MONTHLY par defaut plutot que de crasher.
      return addMonthsClamped(next, 1, dayOfMonth);
  }
}

/**
 * Ajoute `monthsToAdd` mois a une date en clampant le jour pour eviter le
 * piege classique "31 janvier + 1 mois = 3 mars". Si dayOfMonth est fourni,
 * c'est lui qui est utilise comme cible (clampe aussi au dernier jour du
 * mois si > nb de jours du mois cible).
 */
function addMonthsClamped(date: Date, monthsToAdd: number, dayOfMonth: number | null): Date {
  const out = new Date(date);
  const targetDay = dayOfMonth ?? date.getDate();
  // setMonth ajoute en gerant le rollover annuel. On set le jour a 1 pour
  // ne pas declencher de rollover prematurement (cas du 31).
  out.setDate(1);
  out.setMonth(out.getMonth() + monthsToAdd);
  // Maintenant on positionne le jour, clampe au dernier jour du mois cible.
  const lastDayOfMonth = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(targetDay, lastDayOfMonth));
  return out;
}
