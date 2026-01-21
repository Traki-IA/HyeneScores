const CACHE_NAME = 'hyenescores-v' + new Date().getTime();
const urlsToCache = [
  '/',
  '/index.html'
];

// Installation : mise en cache et prise de contrôle immédiate
self.addEventListener('install', (event) => {
  console.log('[SW] Installation en cours...');
  // Force le nouveau service worker à prendre le contrôle immédiatement
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cache créé');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation en cours...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Prend le contrôle de tous les clients immédiatement
      return self.clients.claim();
    })
  );
});

// Stratégie Network First : toujours essayer le réseau d'abord
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Si la réponse réseau est OK, mettre en cache et retourner
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // Si le réseau échoue, utiliser le cache
        return caches.match(event.request);
      })
  );
});
