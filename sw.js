const CACHE_NAME = 'hub-ops-v1';
const ASSETS = [
  './index.html',
  './icon.jpg',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install event: cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: Network-first strategy for index.html, Cache-first for others
self.addEventListener('fetch', (event) => {
  // We only want to intercept basic GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip API requests (Supabase, etc)
  if (event.request.url.includes('supabase.co')) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // If we find a cached response, return it.
      // Otherwise, fetch from network.
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        // Fallback for offline mode if needed
        console.log("Offline mode: unable to fetch", event.request.url);
      });
    })
  );
});
