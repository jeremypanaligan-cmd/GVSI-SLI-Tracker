/**
 * GVSI SLI Tracker — URL & localStorage State Utilities
 *
 * Persists the app's shareable view state (plan, date, month/year, view) to the
 * URL query string (?plan=&date=&month=&view=) and localStorage, so refreshes
 * restore the exact screen and links can be shared between users.
 *
 * URL formats (canonical, sortable, no spaces/encoding needed):
 *   date  → YYYY-MM-DD   (internal display: "September 6, 2026")
 *   month → YYYY-MM      (internal display: "September 2026")
 *
 * Date/month values are converted at the boundary; the app state itself keeps
 * using the display format everywhere.
 */

export const STATE_STORAGE_KEYS = {
  plan: 'gvsi_active_plan',
  date: 'gvsi_selected_date',
  month: 'gvsi_selected_month',
  view: 'gvsi_selected_view',
}

const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

// Abbreviated (and partial) month names → index, for lenient parsing of
// "Sep 6, 2026"-style values stored by older versions.
const MONTH_ABBR = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** Resolve a month name (full or abbreviated) to its 0-based index, or -1. */
function monthIndex(name) {
  const lower = String(name || '').toLowerCase().replace(/\.$/, '')
  const full = FULL_MONTHS.findIndex((n) => n.toLowerCase() === lower)
  if (full !== -1) return full
  return MONTH_ABBR[lower] ?? -1
}

/** "September 6, 2026" → "2026-09-06" (or "" when unparseable) */
export function formatDateParam(displayDate) {
  const m = String(displayDate || '').match(/(\w+)\s+(\d+),?\s*(\d{4})/)
  if (!m) return ''
  const monthIdx = monthIndex(m[1])
  if (monthIdx === -1) return ''
  return `${m[3]}-${pad2(monthIdx + 1)}-${pad2(parseInt(m[2], 10))}`
}

/** "2026-09-06" → "September 6, 2026" (or "" when invalid) */
export function parseDateParam(urlDate) {
  const m = String(urlDate || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return ''
  const year = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  const day = parseInt(m[3], 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return ''
  return `${FULL_MONTHS[month - 1]} ${day}, ${year}`
}

/** "September 2026" → "2026-09" (or "" when unparseable) */
export function formatMonthParam(displayMonth) {
  const m = String(displayMonth || '').match(/^(\w+)\s+(\d{4})$/)
  if (!m) return ''
  const monthIdx = monthIndex(m[1])
  if (monthIdx === -1) return ''
  return `${m[2]}-${pad2(monthIdx + 1)}`
}

/** "2026-09" → "September 2026" (or "" when invalid) */
export function parseMonthParam(urlMonth) {
  const m = String(urlMonth || '').match(/^(\d{4})-(\d{1,2})$/)
  if (!m) return ''
  const year = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  if (month < 1 || month > 12) return ''
  return `${FULL_MONTHS[month - 1]} ${year}`
}

/**
 * Read shareable state from the URL query string.
 * Returns { plan, date, month, view } — date/month already converted to the
 * internal display format, empty strings when absent or invalid.
 */
export function readUrlState() {
  try {
    const params = new URLSearchParams(window.location.search)
    return {
      plan: params.get('plan') || '',
      date: parseDateParam(params.get('date')),
      month: parseMonthParam(params.get('month')),
      view: params.get('view') || '',
    }
  } catch {
    return { plan: '', date: '', month: '', view: '' }
  }
}

/**
 * Write shareable state to the URL via history.replaceState.
 * Never uses pushState — date stepping would otherwise spam history entries.
 * Empty values remove their param. Best-effort (swallowed errors).
 */
export function writeUrlState({ plan, date, month, view }) {
  try {
    const params = new URLSearchParams(window.location.search)
    if (plan) params.set('plan', plan); else params.delete('plan')
    if (date) params.set('date', formatDateParam(date)); else params.delete('date')
    if (month) params.set('month', formatMonthParam(month)); else params.delete('month')
    if (view) params.set('view', view); else params.delete('view')
    const qs = params.toString()
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(null, '', url)
  } catch { /* ignore — URL sync is best-effort */ }
}