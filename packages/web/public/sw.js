// Exprsn Service Worker — Push Notifications + Offline Caching

const CACHE_NAME = 'exprsn-v1';
const SHELL_URLS = [
  '/',
  '/discover',
  '/login',
  '/offline',
];

// Install: precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_URLS).catch(() => {
        // Some URLs may fail during dev — that's ok
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  event.waitUntil(clients.claim());
});

// Fetch: network-first for navigation, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API calls and WebSocket upgrades
  if (url.pathname.startsWith('/xrpc/') || url.pathname.startsWith('/api/')) return;

  // For navigation requests: network first, fall back to cache, then offline page
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
        .catch(() => caches.match('/offline'))
    );
    return;
  }

  // For static assets: cache first, then network, then store in cache
  if (url.pathname.match(/\.(js|css|woff2?|png|jpg|svg|ico)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }
});

// Handle push events
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};

  const title = data.title || 'Exprsn';
  const options = {
    body: data.body || 'You have a new notification',
    icon: data.icon || '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || 'exprsn-notification',
    data: {
      url: data.url || '/',
      type: data.type,
      conversationId: data.conversationId,
    },
    actions: data.actions || [],
    vibrate: [100, 50, 100],
    renotify: !!data.tag,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            url,
            data: event.notification.data,
          });
          return;
        }
      }
      // Open new window if no existing one
      return clients.openWindow(url);
    })
  );
});
