const CACHE_NAME = 'gvsi-sli-v8'
const DATA_CACHE = 'gvsi-sli-data-v4'
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

// Activate: delete all old caches, then create fresh ones
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((k) => caches.delete(k)))
    }).then(() => {
      return caches.open(CACHE_NAME)
    }).then(() => {
      return caches.open(DATA_CACHE)
    })
  )
  self.clients.claim()
})

// Fetch handler
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip non-http(s) requests
  if (event.request.method !== 'GET') return
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  // Google Sheets data — cache-first with network update
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
            .catch(() => cached)

          return cached || fetchPromise
        })
      })
    )
    return
  }

  // App shell — stale-while-revalidate
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
})
