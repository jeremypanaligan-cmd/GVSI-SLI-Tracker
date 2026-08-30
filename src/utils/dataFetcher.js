import { parseCSV } from './csvParser'

const MTD_CSV_URL = 'https://docs.google.com/spreadsheets/d/1UUd8cpfKeOCBHANx9wmM7l1apFyDoZRv0dHZa2_bVr0/export?format=csv&gid=1061751267'
const RAW_DATA_CSV_URL = 'https://docs.google.com/spreadsheets/d/1UUd8cpfKeOCBHANx9wmM7l1apFyDoZRv0dHZa2_bVr0/export?format=csv'

const MTD_CACHE_KEY = 'gvsi_mtd_data'
const RAW_CACHE_KEY = 'gvsi_raw_data'
const CACHE_TIME_KEY = 'gvsi_data_time'
const CACHE_MAX_AGE = 1000 * 60 * 5 // 5 minutes

/**
 * Fetch both MTD and RAW DATA sheets in parallel.
 * Returns { mtd: [...], raw: [...], source, timestamp }
 */
export async function fetchAllData() {
  const isOnline = navigator.onLine

  if (isOnline) {
    try {
      const [mtdRes, rawRes] = await Promise.all([
        fetch(MTD_CSV_URL, { cache: 'no-store' }),
        fetch(RAW_DATA_CSV_URL, { cache: 'no-store' })
      ])

      if (!mtdRes.ok) throw new Error(`MTD HTTP ${mtdRes.status}`)
      if (!rawRes.ok) throw new Error(`RAW HTTP ${rawRes.status}`)

      const [mtdText, rawText] = await Promise.all([
        mtdRes.text(),
        rawRes.text()
      ])

      const mtd = parseCSV(mtdText)
      const raw = parseCSV(rawText)

      // Cache
      try {
        localStorage.setItem(MTD_CACHE_KEY, JSON.stringify(mtd))
        localStorage.setItem(RAW_CACHE_KEY, JSON.stringify(raw))
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString())
      } catch { /* storage full */ }

      return { mtd, raw, source: 'live', timestamp: new Date() }
    } catch (err) {
      console.warn('Live fetch failed, trying cache:', err.message)
    }
  }

  return getCachedData()
}

/**
 * Get cached data from localStorage
 */
export function getCachedData() {
  try {
    const mtdRaw = localStorage.getItem(MTD_CACHE_KEY)
    const rawRaw = localStorage.getItem(RAW_CACHE_KEY)
    const timeStr = localStorage.getItem(CACHE_TIME_KEY)

    if (!mtdRaw && !rawRaw) return { mtd: [], raw: [], source: 'none', timestamp: null }

    const mtd = mtdRaw ? JSON.parse(mtdRaw) : []
    const raw = rawRaw ? JSON.parse(rawRaw) : []
    const timestamp = timeStr ? new Date(Number(timeStr)) : null

    const age = timestamp ? Date.now() - timestamp.getTime() : Infinity
    const source = age > CACHE_MAX_AGE ? 'stale-cache' : 'cache'

    return { mtd, raw, source, timestamp }
  } catch {
    return { mtd: [], raw: [], source: 'none', timestamp: null }
  }
}
