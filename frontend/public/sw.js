// Service worker minimaliste pour le CRM MDO.
// Strategy :
//   - cache "offline shell" : les assets statiques Next.js (chunks/_next/static/*)
//     en stale-while-revalidate, le user voit l'app meme si la connexion est moisie.
//   - les requetes /api/* ne sont JAMAIS cachees : on veut toujours frais et on
//     evite de servir de la donnee perimee.
//   - une page /offline.html est servie en fallback HTML si le reseau est down.
//
// Cache versionne pour invalider proprement : bump CACHE_NAME a chaque deploy
// majeur (mecanisme manuel, suffit a notre echelle).

const CACHE_NAME = 'crm-mdo-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      } catch {
        // offline.html absent en dev : on continue quand meme
      }
    })(),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 1. Pas de cache pour /api/* : fraicheur garantie.
  if (url.pathname.startsWith('/api/')) return;

  // 2. Assets statiques Next.js : stale-while-revalidate.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached ?? network;
      }),
    );
    return;
  }

  // 3. Pages HTML : reseau d'abord, fallback offline.html.
  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(OFFLINE_URL)) ?? new Response('Offline', { status: 503 });
      }),
    );
  }
});
