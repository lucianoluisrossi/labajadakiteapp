// Service Worker - La Bajada Kite App
const CACHE_NAME = 'labajada-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install: Cachear archivos estáticos
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker instalando...');
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Cacheando archivos estáticos...');
        return cache.addAll(ASSETS_TO_CACHE).catch(() => {
          console.log('⚠️ Algunos archivos no pudieron cachearse (normal en dev)');
        });
      })
  );
});

// Activate: Limpiar caches viejos
self.addEventListener('activate', (event) => {
  console.log('⚡ Service Worker activado');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => {
            console.log('🗑️ Eliminando cache viejo:', cacheName);
            return caches.delete(cacheName);
          })
      );
    })
  );
});

// Fetch: Network-first, fallback a cache
self.addEventListener('fetch', (event) => {
  // Solo cachear GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // No cachear si no es una respuesta válida
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Clonar y guardar en cache
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      })
      .catch(() => {
        // Si offline, intentar obtener del cache
        return caches.match(event.request)
          .then((cachedResponse) => {
            return cachedResponse || new Response('Offline - recurso no disponible', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

console.log('✅ Service Worker cargado correctamente');
