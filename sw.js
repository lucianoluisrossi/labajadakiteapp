// Service Worker Desactivado
// La Bajada Kite App - Sin notificaciones push

console.log('🗑️ Service Worker de limpieza activado');

// Desregistrar este mismo Service Worker
self.addEventListener('install', (event) => {
    console.log('🗑️ Desregistrando Service Worker...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('🗑️ Service Worker desactivándose...');
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                // Eliminar TODOS los caches
                return Promise.all(
                    cacheNames.map(cache => {
                        console.log('🗑️ Eliminando cache:', cache);
                        return caches.delete(cache);
                    })
                );
            })
            .then(() => {
                console.log('✅ Caches eliminados');
                // Desregistrar este mismo SW
                return self.registration.unregister();
            })
            .then(() => {
                console.log('✅ Service Worker desregistrado completamente');
            })
    );
});

console.log('✅ SW de limpieza cargado - se auto-destruirá');
