// szept PWA Service Worker
// Provides: installability, app shell caching, offline fallback

const CACHE_NAME = 'szept-v1'

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

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Never cache Matrix API requests, WebSocket, or auth-related calls
  if (
    url.pathname.startsWith('/_matrix/') ||
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
