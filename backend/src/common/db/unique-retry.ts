import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const logger = new Logger('UniqueRetry');

// Helper anti-TOCTOU pour generation de references uniques (TKT-2026-0001,
// MDO-2026-0042, 2026-04-0001 facture, ...).
//
// Le pattern naif est :
//     const last = await prisma.x.findFirst({ orderBy: { ref: 'desc' } });
//     const next = parseInt(last.ref) + 1;
//     await prisma.x.create({ data: { ref: makeRef(next) } });
// Race : deux requetes concurrentes lisent le meme `last`, calculent le meme
// `next`, et la 2e create echoue avec P2002 (unique violation) — ou pire,
// genere un doublon si le champ n'a pas d'index unique.
//
// Solution : on retry l'ensemble (genere la ref + tente la creation) jusqu'a
// N essais. A chaque retry, le findFirst voit la ref tout juste cree par le
// concurrent, donc next devient correct. Pas besoin de SELECT ... FOR UPDATE
// ni de sequence Postgres dediee — c'est l'approche pragmatique.
//
// Usage :
//   const ticket = await withUniqueRetry(
//     () => generateNextReference(),  // retourne la ref candidate
//     (ref) => prisma.ticket.create({ data: { ...input, reference: ref } }),
//   );
export async function withUniqueRetry<T>(
  generate: () => Promise<string>,
  attempt: (ref: string) => Promise<T>,
  maxRetries = 5,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < maxRetries; i++) {
    const ref = await generate();
    try {
      return await attempt(ref);
    } catch (err) {
      // P2002 = unique constraint violation. C'est exactement le cas ou un
      // concurrent a pris notre numero entre le findFirst et le create.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        lastError = err;
        if (i < maxRetries - 1) {
          logger.warn(`Collision sur reference "${ref}", retry ${i + 1}/${maxRetries}`);
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError ?? new Error('withUniqueRetry: epuise sans erreur capturee');
}
