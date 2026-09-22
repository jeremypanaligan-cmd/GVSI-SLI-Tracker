// Cache names carry the app version the page registered us with (?v=<version>), so a
// release never needs this file edited — see src/utils/version.js and vite.config.js.
let VERSION = 'dev'
try {
  VERSION = new URL(self.location.href).searchParams.get('v') || 'dev'
} catch (e) { /* keep the default */ }
const CACHE_NAME = `gvsi-sli-v${VERSION}`
const DATA_CACHE = `gvsi-sli-data-v${VERSION}`
const BASE = '/GVSI-SLI-Tracker'

const SHELL_ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/favicon.svg',
  BASE + '/manifest.json',
  BASE + '/icon-192.png',
  BASE + '/icon-512.png',
  BASE + '/brand-mark.svg',
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

  // ── The version file: NETWORK-ONLY, no cache at all ──
  //
  // The page compares this with the version it is running to decide whether the user
  // may continue. A cached copy would answer "you are up to date" forever, so it is
  // never stored — not even as an offline fallback.
  if (url.pathname === BASE + '/version.json') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }))
    return
  }

  // ── The HTML document: NETWORK-FIRST, cache only as the offline fallback ──
  //
  // This branch comes BEFORE the shell assets on purpose. The document names the hashed
  // bundle, so a cached document pinned every user to the previous build until they
  // hard-refreshed — which is how a stale bundle kept serving the old login path and
  // locked people out the morning after a release (2026-09-21). Only the offline copy
  // is kept, under one URL, so the fallback stays a single entry.
  if (event.request.mode === 'navigate' || isHtmlRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(BASE + '/index.html', clone)).catch(() => {})
          return response
        })
        .catch(() =>
          caches.match(event.request).then((hit) => hit || caches.match(BASE + '/index.html'))
        )
    )
    return
  }

  // ── Google Sheets CSV data: NETWORK-FIRST ──
  if (url.hostname === 'docs.google.com' && url.pathname.includes('/export')) {
    if (!url.searchParams.has('t')) {
      event.respondWith(networkFirst(event.request, DATA_CACHE))
    } else {
      event.respondWith(fetch(event.request).catch(() => caches.match(event.request)))
    }
    return
  }

  // ── App shell & static assets: STALE-WHILE-REVALIDATE ──
  if (isShellAsset(url)) {
    event.respondWith(staleWhileRevalidate(event.request, CACHE_NAME))
    return
  }

  // ── Everything else: CACHE-FIRST with NETWORK fallback ──
  event.respondWith(cacheFirst(event.request, CACHE_NAME))
})

// ── Caching Strategies ──

/**
 * NETWORK-FIRST: Try network, fall back to cache.
 * Clone response immediately to avoid body-already-used errors.
 */
function networkFirst(request, cacheName) {
  return fetch(request)
    .then((response) => {
      // Clone IMMEDIATELY before any async work
      const clone = response.clone()
      caches.open(cacheName).then((c) => c.put(request, clone)).catch(() => {})
      return response
    })
    .catch(() => caches.match(request))
}

/**
 * STALE-WHILE-REVALIDATE: Return cached, update in background.
 */
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            cache.put(request, clone)
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
 */
function cacheFirst(request, cacheName) {
  return caches.match(request).then((cached) => {
    if (cached) return cached
    return fetch(request).then((response) => {
      if (response.ok) {
        const clone = response.clone()
        caches.open(cacheName).then((c) => c.put(request, clone)).catch(() => {})
      }
      return response
    })
  })
}

/** 'index.html', '/GVSI-SLI-Tracker/' — anything that is an HTML document. */
function isHtmlRequest(url) {
  const path = url.pathname.replace(/\/$/, '/')
  return path.endsWith('.html') || path === BASE + '/' || path === BASE || path === '/'
}

/**
 * Check if URL is a pre-cached shell asset.
 *
 * HTML is deliberately excluded: the document must always come from the network (see the
 * fetch handler), because it is what names the current bundle.
 */
function isShellAsset(url) {
  if (isHtmlRequest(url)) return false
  return (
    url.origin === self.location.origin &&
    (url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.woff2') ||
      url.pathname.endsWith('.ico'))
  )
}
