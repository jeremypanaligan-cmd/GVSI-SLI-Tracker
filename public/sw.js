const CACHE_NAME = 'gvsi-sli-v4'
const BASE = '/GVSI-SLI-Tracker'

const SHELL_ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/favicon.svg',
  BASE + '/manifest.json',
]

// Install: pre-cache shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  )
  self.skipWaiting()
})

// Activate: clean ALL old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch: network-first for everything (avoids stale cache issues)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Google Sheets data — network only, no caching
  if (url.hostname === 'docs.google.com') return

  // App shell — network-first, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone)
          })
        }
        return response
      })
      .catch(() => caches.match(event.request))
  )
})
