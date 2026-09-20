// Service worker de la PWA de dictado — v1.
// CRITICO (skill add-mobile, 14 commits de debugging): NADA de fetch handler; interceptar
// fetch rompe la PWA en iOS Safari. Solo instalar, activar y limpiar caches viejos.

const CACHE_NAME = 'dictado-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});
