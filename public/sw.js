const CACHE_NAME = 'gvsi-sli-v10'
const DATA_CACHE = 'gvsi-sli-data-v6'
const BASE = '/GVSI-SLI-Tracker'

const SHELL_ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/favicon.svg',
  BASE + '/manifest.json',
  BASE + '/icon-192.png',
  BASE + '/icon-512.png',
]

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  )
  self.skipWaiting()
})

// Activate: clean up old caches efficiently
self.addEventListener('activate', (event) => {
  const KEEP_CACHES = new Set([CACHE_NAME, DATA_CACHE])
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !KEEP_CACHES.has(k)).map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// Fetch handler with smart routing
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip non-GET and non-http(s)
  if (event.request.method !== 'GET') return
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  // ── Google Sheets CSV data: NETWORK-FIRST ──
  // Data changes frequently; try network, fall back to cache when offline.
  // Skip URLs with cache-bust param (?t=) to avoid polluting cache.
  if (url.hostname === 'docs.google.com' && url.pathname.includes('/export')) {
    if (!url.searchParams.has('t')) {
      event.respondWith(networkFirst(event.request, DATA_CACHE))
    } else {
      // Cache-busted request — network only, don't cache
      event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
    }
    return
  }

  // ── App shell & static assets: STALE-WHILE-REVALIDATE ──
  // Return cached version immediately, update in background.
  // This makes the app feel instant on repeat visits.
  if (isShellAsset(url)) {
    event.respondWith(staleWhileRevalidate(event.request, CACHE_NAME))
    return
  }

  // ── Navigation requests: NETWORK with OFFLINE FALLBACK ──
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the navigation response for offline use
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          return response
        })
        .catch(() => caches.match(BASE + '/index.html'))
    )
    return
  }

  // ── Everything else: CACHE-FIRST with NETWORK fallback ──
  event.respondWith(cacheFirst(event.request, CACHE_NAME))
})

// ── Caching Strategies ──

/**
 * NETWORK-FIRST: Try network, fall back to cache.
 * Best for data that changes frequently.
 */
function networkFirst(request, cacheName) {
  return fetch(request)
    .then((response) => {
      if (response.ok) {
        const cache = caches.open(cacheName)
        cache.then((c) => c.put(request, response.clone()))
      }
      return response
    })
    .catch(() => caches.match(request))
}

/**
 * STALE-WHILE-REVALIDATE: Return cached, update in background.
 * Best for assets that rarely change but should stay current.
 */
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            cache.put(request, response.clone())
          }
          return response
        })
        .catch(() => cached)

      return cached || fetchPromise
    })
  )
}

/**
 * CACHE-FIRST: Return cached, only fetch if not in cache.
 * Best for static assets that almost never change.
 */
function cacheFirst(request, cacheName) {
  return caches.match(request).then((cached) => {
    if (cached) return cached
    return fetch(request).then((response) => {
      if (response.ok) {
        const cache = caches.open(cacheName)
        cache.then((c) => c.put(request, response.clone()))
      }
      return response
    })
  })
}

/**
 * Check if URL is a pre-cached shell asset.
 */
function isShellAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.woff2') ||
      url.pathname.endsWith('.ico') ||
      url.pathname === BASE + '/' ||
      url.pathname === BASE)
  )
}
