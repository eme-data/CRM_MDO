'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Force le re-execution d'un callback dans 2 cas :
 *   1. Le pathname change vers la page courante (retour via Link)
 *   2. L'onglet redevient visible (changement d'onglet, deverouillage)
 *
 * Pourquoi : le Router Cache de Next.js App Router conserve les Client
 * Components en memoire et NE re-execute PAS leurs useEffect lors d'un
 * retour sur la page. Resultat : creer une societe -> revenir sur la liste
 * -> on ne voit pas la nouvelle entree.
 *
 * staleTimes.dynamic=0 dans next.config.js corrige le cas du retour via Link
 * mais pas le cas onglet (Tab inactif puis re-focus). Ce hook complete.
 *
 * Usage :
 *   useReloadOnFocus(load);
 */
export function useReloadOnFocus(callback: () => void): void {
  const pathname = usePathname();

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') callback();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-tire callback a chaque changement de pathname (retour sur la page).
  // Le useEffect [pathname] s'execute aussi au mount initial — pas un probleme,
  // c'est le comportement attendu pour les pages liste.
  useEffect(() => {
    callback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
}
