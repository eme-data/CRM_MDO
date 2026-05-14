import { computeNextRunAt } from './recurring-tasks.helpers';

describe('computeNextRunAt', () => {
  it('WEEKLY ajoute 7 jours et fixe l heure a 06:00', () => {
    const from = new Date('2026-01-10T14:30:00.000Z');
    const next = computeNextRunAt(from, 'WEEKLY', null);
    // 7 jours plus tard, heure 06:00 local (l'assertion exacte depend du TZ
    // de l'environnement de test). On verifie l'ecart en jours et l'heure.
    const diff = next.getTime() - from.getTime();
    expect(diff).toBeGreaterThan(6 * 86400_000);
    expect(diff).toBeLessThan(8 * 86400_000);
    expect(next.getHours()).toBe(6);
    expect(next.getMinutes()).toBe(0);
  });

  it('MONTHLY ajoute 1 mois sans dayOfMonth -> meme jour', () => {
    const from = new Date(2026, 0, 15, 14, 30); // 15 jan 2026
    const next = computeNextRunAt(from, 'MONTHLY', null);
    expect(next.getMonth()).toBe(1); // fevrier
    expect(next.getDate()).toBe(15);
  });

  it('MONTHLY avec dayOfMonth=5 cible le 5 du mois suivant', () => {
    const from = new Date(2026, 0, 15, 14, 30); // 15 jan
    const next = computeNextRunAt(from, 'MONTHLY', 5);
    expect(next.getMonth()).toBe(1); // fevrier
    expect(next.getDate()).toBe(5);
  });

  it('MONTHLY avec dayOfMonth=31 en fevrier -> clampe au 28 (ou 29 si bissextile)', () => {
    const from = new Date(2026, 0, 31, 14, 30); // 31 jan 2026
    const next = computeNextRunAt(from, 'MONTHLY', 31);
    expect(next.getMonth()).toBe(1); // fevrier
    // 2026 n'est pas bissextile -> 28 fevrier
    expect(next.getDate()).toBe(28);
  });

  it('MONTHLY avec dayOfMonth=31 en avril -> clampe au 30', () => {
    const from = new Date(2026, 2, 31, 14, 30); // 31 mars
    const next = computeNextRunAt(from, 'MONTHLY', 31);
    expect(next.getMonth()).toBe(3); // avril
    expect(next.getDate()).toBe(30);
  });

  it('QUARTERLY ajoute 3 mois', () => {
    const from = new Date(2026, 0, 15);
    const next = computeNextRunAt(from, 'QUARTERLY', null);
    expect(next.getMonth()).toBe(3); // avril
    expect(next.getDate()).toBe(15);
  });

  it('YEARLY ajoute 12 mois (annee suivante)', () => {
    const from = new Date(2026, 5, 15);
    const next = computeNextRunAt(from, 'YEARLY', null);
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(5);
    expect(next.getDate()).toBe(15);
  });

  it('YEARLY 29 fevrier 2024 + 1 an -> 28 fevrier 2025 (clamping)', () => {
    const from = new Date(2024, 1, 29);
    const next = computeNextRunAt(from, 'YEARLY', 29);
    expect(next.getFullYear()).toBe(2025);
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(28);
  });
});
