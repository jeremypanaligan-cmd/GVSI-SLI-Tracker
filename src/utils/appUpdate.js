/**
 * Is the copy of the app running in this browser the one the server is serving?
 *
 * A service worker keeps a copy of the app on the device, which is the point of it — but
 * it also means a release does not reach anyone until their browser decides to re-check.
 * That is how a stale bundle kept serving the old login path the morning after a release
 * and locked users out until they hard-refreshed. Prompting was not enough: by the time
 * the prompt appeared the app had already been used, and "Later" was one tap away.
 *
 * So the app now asks the server what version it is serving (`version.json`, written from
 * `package.json` at build time by vite.config.js) *before* it renders anything, and if the
 * answer is not the version it is running it refuses to start until the device updates.
 *
 * The update check must never be the reason the app is unusable:
 *   - an unreachable or missing `version.json` is treated as "cannot tell", not as stale,
 *     so an offline launch and a first deploy of this feature both keep working;
 *   - every request carries a unique query, so it cannot be answered from a cache on any
 *     layer — including the older service worker, which knows nothing about the file and
 *     would otherwise cache-first it forever.
 */

import { APP_VERSION } from './version'

/**
 * Fired when a newly activated service worker means this page may be running an old
 * build. It only asks for a fresh version check — the gate decides what the user sees.
 * It replaced the dismissible "New version ready" prompt, which arrived after the app had
 * already been used and was one tap from being ignored.
 */
export const UPDATE_AVAILABLE_EVENT = 'gvsi:update-available'

const VERSION_FILE = 'version.json'

/** Random tag for one check — defeats every cache between the page and the server. */
function cacheBuster() {
  return `${Date.now().toString(36)}-${Math.round(Math.random() * 1e9).toString(36)}`
}

/**
 * The version the server is serving right now, or null when it cannot be determined.
 *
 * @param {object} [options]
 * @param {number} [options.timeoutMs]  give up rather than hold up the first paint
 * @returns {Promise<string|null>}
 */
export async function fetchDeployedVersion({ timeoutMs = 6000 } = {}) {
  const base = import.meta.env.BASE_URL || '/'
  const url = `${base}${VERSION_FILE}?t=${cacheBuster()}`

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller ? controller.signal : undefined,
    })
    if (!response.ok) return null
    const data = await response.json()
    const version = data && typeof data.version === 'string' ? data.version.trim() : ''
    return version || null
  } catch {
    // Offline, blocked, aborted, or not deployed yet — say "unknown" rather than guess.
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Should the app refuse to start?
 *
 * Only when the server's version is known *and* different. An unknown version never
 * blocks: the alternative is an app that cannot be opened without a network.
 */
export function isUpdateRequired(deployedVersion, runningVersion = APP_VERSION) {
  if (!deployedVersion) return false
  if (!runningVersion || runningVersion === 'dev') return false
  return deployedVersion !== runningVersion
}

/**
 * Drop everything this device has cached and reload onto the server's version.
 *
 * Unregistering the worker first matters: it is the thing serving the old document, and a
 * plain reload would be answered by it (or by the browser's HTTP cache, whose max-age on
 * the document can be minutes long). The `?v=` on the reload makes the document request
 * unambiguous; the running build is gone by then, so nothing is left to serve it.
 *
 * @param {string|null} [toVersion]  written into the URL for the reload
 */
export async function applyUpdate(toVersion = null) {
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
  } catch {
    // A failed unregister must not stop the reload.
  }

  try {
    if (typeof caches !== 'undefined' && caches.keys) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch {
    // Same: cache clearing is best-effort.
  }

  const url = new URL(window.location.href)
  url.searchParams.set('v', toVersion || Date.now().toString(36))
  window.location.replace(url.toString())
}
