// szept PWA Service Worker
// Provides: installability, app shell caching, offline fallback, notifications

const CACHE_NAME = 'szept-v5'

// App shell — cached on install for instant loads
const APP_SHELL = [
  '/',
  '/login',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.ico',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  )
  // Activate immediately instead of waiting for existing tabs to close
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  )
  // Take control of all open tabs immediately
  self.clients.claim()
})

// --- Notifications ---
// The main thread posts messages to the SW to show notifications.
// This works even when the tab is in the background on mobile.

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, data } = event.data
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: tag || 'szept-message',
        renotify: true,
        vibrate: [200, 100, 200],
        data,
      })
    )
  }
})

// Handle notification click — focus the app or open it
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Send the room ID to the client so it can navigate
          if (event.notification.data?.roomId) {
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              roomId: event.notification.data.roomId,
            })
          }
          return client.focus()
        }
      }
      // No existing tab — open the app
      if (self.clients.openWindow) {
        return self.clients.openWindow('/')
      }
    })
  )
})

// --- Caching ---

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Never cache Matrix API requests, WebSocket, auth, or crypto key endpoints
  if (
    url.pathname.startsWith('/_matrix/') ||
    url.pathname.includes('/keys/') ||
    url.pathname.includes('/sync') ||
    url.protocol === 'wss:' ||
    request.method !== 'GET'
  ) {
    return
  }

  // Network-first for HTML pages (always get latest)
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    )
    return
  }

  // Cache-first for static assets (JS, CSS, images, fonts)
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.match(/\.(js|css|png|svg|woff2?|ico)$/)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
            return response
          })
      )
    )
    return
  }
})
