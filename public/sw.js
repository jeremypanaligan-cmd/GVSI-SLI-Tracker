const CACHE_NAME = 'gvsi-sli-v5'
const DATA_CACHE = 'gvsi-sli-data-v1'
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

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      const keep = new Set([CACHE_NAME, DATA_CACHE])
      return Promise.all(
        keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))
      )
    })
  )
  self.clients.claim()
})

// Fetch handler
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Google Sheets data — cache-first with network update (for offline)
  if (url.hostname === 'docs.google.com' && url.pathname.includes('/export')) {
    event.respondWith(
      caches.open(DATA_CACHE).then((cache) => {
        return cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request)
            .then((response) => {
              if (response.ok) {
                cache.put(event.request, response.clone())
              }
              return response
            })
            .catch(() => cached) // offline: return cached version

          // Return cached immediately if available, update in background
          return cached || fetchPromise
        })
      })
    )
    return
  }

  // App shell — cache-first with network update (stale-while-revalidate)
  // Skip non-http(s) requests (e.g. chrome-extension://)
  if (event.request.method === 'GET' && (url.protocol === 'http:' || url.protocol === 'https:')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request)
            .then((response) => {
              if (response.ok) {
                cache.put(event.request, response.clone())
              }
              return response
            })
            .catch(() => cached)

          return cached || fetchPromise
        })
      })
    )
  }
})
