const CACHE_NAME = 'hyenescores-v1';
const urlsToCache = [
  '/',
  '/index.html'
];

// Installation : mise en cache et prise de contrôle immédiate
self.addEventListener('install', (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Stratégie Network First : uniquement pour les ressources statiques same-origin
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ne pas cacher les appels API Supabase ni les ressources tierces
  if (url.origin !== self.location.origin) return;

  // Ne pas cacher les requêtes non-GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
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
        return caches.match(event.request);
      })
  );
});
