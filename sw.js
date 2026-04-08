const CACHE_NAME = 'tezgram-cache-v' + new Date().toISOString().split('T')[0].replace(/-/g, '');
const STATIC_CACHE = 'tezgram-static-v1';
const DYNAMIC_CACHE = 'tezgram-dynamic-v1';
const urlsToCache = [
  '/',
  '/index.html?t=' + Date.now(),
  '/index.css?t=' + Date.now(),
  '/app.js?t=' + Date.now(),
  '/manifest.json',
  '/assets/logo.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => cache.addAll(urlsToCache).catch(() => {})),
      caches.keys().then(names => {
        return Promise.all(names.filter(name => name !== STATIC_CACHE && name !== DYNAMIC_CACHE).map(name => caches.delete(name)));
      })
    ])
  );
});

self.addEventListener('activate', event => {
  self.clients.claim();
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE && !cacheName.startsWith('tezgram-cache-v')) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Network-first for HTML to always get fresh content
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        return caches.match(event.request).then(response => {
          return response || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
    );
    return;
  }
  
  // Don't cache Firebase requests
  if (url.host.includes('firebase') || 
      url.host.includes('googleapis.com') ||
      url.host.includes('gstatic.com')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Cache-first strategy for static assets
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).then(fetchResponse => {
        if (fetchResponse.status === 200) {
          const responseClone = fetchResponse.clone();
          caches.open(STATIC_CACHE).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return fetchResponse;
      });
    }).catch(() => {
      return caches.match(event.request);
    })
  );
});
