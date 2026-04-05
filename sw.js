// Service Worker - La Bajada Kite App
const CACHE_NAME = 'labajada-cache-v1';
const RUNTIME_CACHE = 'labajada-runtime-v1';

// Archivos críticos que deben estar cacheados
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json'
];

// ==========================================
// INSTALL EVENT
// ==========================================
self.addEventListener('install', (event) => {
  console.log('[SW] 🔧 Service Worker instalando...');
  self.skipWaiting(); // Activar inmediatamente

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] 📦 Cacheando archivos críticos...');
        return cache.addAll(CRITICAL_ASSETS)
          .catch((error) => {
            console.warn('[SW] ⚠️ No se pudieron cachear todos los assets (puede ser normal):', error.message);
          });
      })
  );
});

// ==========================================
// ACTIVATE EVENT
// ==========================================
self.addEventListener('activate', (event) => {
  console.log('[SW] ⚡ Service Worker activando...');
  self.clients.claim(); // Controlar inmediatamente

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map((name) => {
            console.log('[SW] 🗑️ Eliminando cache viejo:', name);
            return caches.delete(name);
          })
      );
    })
  );
});

// ==========================================
// FETCH EVENT - Network First Strategy
// ==========================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests que no sean GET
  if (request.method !== 'GET') {
    return;
  }

  // Ignorar extensiones de chrome
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // Network first para contenido dinámico, cache first para statics
  if (url.pathname.includes('/api/') || url.pathname.includes('.json')) {
    // APIs: Network first
    event.respondWith(networkFirstStrategy(request));
  } else {
    // Assets: Cache first, fallback network
    event.respondWith(cacheFirstStrategy(request));
  }
});

// ==========================================
// ESTRATEGIAS DE CACHE
// ==========================================

async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] ⚠️ Network failed, trying cache:', request.url);
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('[SW] ⚠️ Failed to fetch:', request.url);
    return new Response('Offline', { status: 503 });
  }
}

// ==========================================
// BACKGROUND SYNC (opcional)
// ==========================================
self.addEventListener('sync', (event) => {
  console.log('[SW] 🔄 Background sync:', event.tag);
});

console.log('[SW] ✅ Service Worker script cargado');
