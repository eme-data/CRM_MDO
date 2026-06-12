'use client';
import { useEffect } from 'react';
import { toast } from 'sonner';

// Enregistre le service worker et gere les mises a jour SANS reload surprise :
// quand un nouveau SW est disponible (apres deploiement), on affiche un toast
// persistant "Nouvelle version disponible" avec un bouton "Recharger". Au clic,
// on active le SW en attente (SKIP_WAITING) puis on recharge l'onglet une fois
// qu'il a pris le controle (controllerchange). Aucun reload n'a lieu sans action
// de l'utilisateur (pas de perte de saisie en cours).
//
// Les mises a jour sont detectees au chargement, au retour sur l'onglet
// (visibilitychange) et periodiquement (reg.update()), sans attendre le check
// ~24h du navigateur.
export function SwUpdater() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let userTriggeredUpdate = false;
    let refreshing = false;
    let promptShown = false;

    function promptUpdate(worker: ServiceWorker) {
      if (promptShown) return;
      promptShown = true;
      toast('Nouvelle version disponible', {
        description: 'Cliquez pour charger la derniere version du CRM.',
        duration: Infinity,
        action: {
          label: 'Recharger',
          onClick: () => {
            userTriggeredUpdate = true;
            worker.postMessage({ type: 'SKIP_WAITING' });
          },
        },
      });
    }

    // Quand le nouveau SW prend le controle, on recharge — mais uniquement si
    // c'est l'utilisateur qui l'a declenche (evite tout reload a la 1ere visite).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing || !userTriggeredUpdate) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Un SW est deja en attente (MAJ detectee lors d'une visite precedente).
        if (reg.waiting && navigator.serviceWorker.controller) {
          promptUpdate(reg.waiting);
        }
        // Nouveau SW en cours d'installation -> prompt quand il est pret.
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            // 'installed' + un controleur existant = vraie MAJ (pas 1ere install).
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              promptUpdate(nw);
            }
          });
        });

        const check = () => reg.update().catch(() => {});
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
        // Filet : verif periodique (5 min) pour les onglets restes au premier plan.
        setInterval(check, 5 * 60 * 1000);
      })
      .catch(() => {});
  }, []);

  return null;
}
