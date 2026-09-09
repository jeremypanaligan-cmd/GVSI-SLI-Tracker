/**
 * GVSI SLI Tracker — Copy Snapshot Link helper
 *
 * Builds the current shareable URL (?plan=&date=&month=&view=) and copies it
 * to the clipboard. The URL is always kept in sync with the app state by
 * urlState.js (history.replaceState), so copying window.location.href is
 * sufficient — the link is self-updating: anyone who opens it gets fresh data
 * for that exact screen state.
 */

/** The full shareable URL for the current view state. */
export function buildShareUrl() {
  try {
    return window.location.href
  } catch {
    return ''
  }
}

/**
 * Copy the current snapshot link to the clipboard.
 * Uses the async Clipboard API, falling back to a hidden textarea +
 * document.execCommand('copy') for older browsers / non-secure contexts.
 * Returns true on success, false otherwise.
 */
export async function copySnapshotLink() {
  const url = buildShareUrl()
  if (!url) return false

  try {
    await navigator.clipboard.writeText(url)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = url
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.top = '0'
      ta.style.left = '0'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      ta.setSelectionRange(0, ta.value.length)
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}