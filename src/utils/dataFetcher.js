import { parseCSV } from './csvParser'

const CSV_URL = 'https://docs.google.com/spreadsheets/d/1C12JsfTZk_5P-yZ7oJliTrE0xl22PPeVVJMQQOzOYVs/export?format=csv&gid=331762489'

const CACHE_KEY = 'gvsi_sli_data'
const CACHE_TIME_KEY = 'gvsi_sli_data_time'
const CACHE_MAX_AGE = 1000 * 60 * 5 // 5 minutes

/**
 * Fetch SLI data from Google Sheets CSV export.
 * Falls back to localStorage cache when offline.
 */
export async function fetchSLIData() {
  const isOnline = navigator.onLine

  if (isOnline) {
    try {
      const res = await fetch(CSV_URL, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      const data = parseCSV(text)

      // Cache the data
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data))
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString())
      } catch {
        // Storage full or unavailable
      }

      return { data, source: 'live', timestamp: new Date() }
    } catch (err) {
      console.warn('Live fetch failed, trying cache:', err.message)
    }
  }

  // Fallback to cache
  return getCachedData()
}

/**
 * Get cached data from localStorage
 */
export function getCachedData() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const timeStr = localStorage.getItem(CACHE_TIME_KEY)
    if (!raw) return { data: null, source: 'none', timestamp: null }

    const data = JSON.parse(raw)
    const timestamp = timeStr ? new Date(Number(timeStr)) : null

    const age = timestamp ? Date.now() - timestamp.getTime() : Infinity
    const source = age > CACHE_MAX_AGE ? 'stale-cache' : 'cache'

    return { data, source, timestamp }
  } catch {
    return { data: null, source: 'none', timestamp: null }
  }
}
