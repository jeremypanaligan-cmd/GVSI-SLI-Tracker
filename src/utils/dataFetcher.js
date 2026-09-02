import { parseCSV } from './csvParser'
import { idbGet, idbSet } from './idbCache'

const MTD_CSV_URL = 'https://docs.google.com/spreadsheets/d/1UUd8cpfKeOCBHANx9wmM7l1apFyDoZRv0dHZa2_bVr0/export?format=csv&gid=1061751267'
const RAW_DATA_CSV_URL = 'https://docs.google.com/spreadsheets/d/1UUd8cpfKeOCBHANx9wmM7l1apFyDoZRv0dHZa2_bVr0/export?format=csv&gid=486719298'

const MTD_CACHE_KEY = 'gvsi_mtd_data_v5'
const RAW_CACHE_KEY = 'gvsi_raw_data_v5'
const CACHE_TIME_KEY = 'gvsi_data_time_v5'
const CACHE_MAX_AGE = 1000 * 60 * 5 // 5 minutes

// Clear ALL old cache versions
try {
  const oldKeys = [
    'gvsi_mtd_data', 'gvsi_raw_data', 'gvsi_data_time',
    'gvsi_mtd_data_v2', 'gvsi_raw_data_v2', 'gvsi_data_time_v2',
    'gvsi_mtd_data_v3', 'gvsi_raw_data_v3', 'gvsi_data_time_v3',
    'gvsi_mtd_data_v4', 'gvsi_raw_data_v4', 'gvsi_data_time_v4',
    'gvsi_sli_data', 'gvsi_sli_data_time'
  ]
  oldKeys.forEach(k => localStorage.removeItem(k))
} catch { /* ignore */ }

/**
 * Save to localStorage; if quota exceeded, fall back to IndexedDB.
 */
async function saveCache(mtd, raw) {
  const json = { mtd: JSON.stringify(mtd), raw: JSON.stringify(raw), time: Date.now().toString() }
  try {
    localStorage.setItem(MTD_CACHE_KEY, json.mtd)
    localStorage.setItem(RAW_CACHE_KEY, json.raw)
    localStorage.setItem(CACHE_TIME_KEY, json.time)
  } catch {
    // localStorage full — use IndexedDB
    console.warn('[Cache] localStorage full, saving to IndexedDB')
    await Promise.all([
      idbSet(MTD_CACHE_KEY, mtd),
      idbSet(RAW_CACHE_KEY, raw),
      idbSet(CACHE_TIME_KEY, json.time),
    ])
  }
}

/**
 * Fetch both MTD and RAW DATA sheets in parallel.
 * Returns { mtd, raw, source, timestamp }
 */
export async function fetchAllData() {
  const isOnline = navigator.onLine
  const bust = '&t=' + Date.now()

  if (isOnline) {
    try {
      const [mtdRes, rawRes] = await Promise.all([
        fetch(MTD_CSV_URL + bust, { cache: 'no-store' }),
        fetch(RAW_DATA_CSV_URL + bust, { cache: 'no-store' })
      ])

      if (!mtdRes.ok) throw new Error(`MTD HTTP ${mtdRes.status}`)
      if (!rawRes.ok) throw new Error(`RAW HTTP ${rawRes.status}`)

      const [mtdText, rawText] = await Promise.all([
        mtdRes.text(),
        rawRes.text()
      ])

      const mtd = parseCSV(mtdText)
      const raw = parseCSV(rawText)

      // Cache fresh data (localStorage → IndexedDB fallback)
      await saveCache(mtd, raw)

      return { mtd, raw, source: 'live', timestamp: new Date() }
    } catch (err) {
      console.warn('[Fetch] Live fetch failed, trying cache:', err.message)
    }
  }

  return await getCachedData()
}

const EMPTY = { mtd: { headers: [], rows: [], objects: [] }, raw: { headers: [], rows: [], objects: [] } }

/**
 * Read cache from localStorage, falling back to IndexedDB if empty/full.
 */
async function readCache() {
  let mtdRaw = null
  let rawRaw = null
  let timeStr = null

  // 1) Try localStorage first
  try {
    mtdRaw = localStorage.getItem(MTD_CACHE_KEY)
    rawRaw = localStorage.getItem(RAW_CACHE_KEY)
    timeStr = localStorage.getItem(CACHE_TIME_KEY)
  } catch { /* ignore */ }

  // 2) If localStorage is empty, try IndexedDB
  if (!mtdRaw && !rawRaw) {
    console.log('[Cache] localStorage empty, trying IndexedDB')
    const [idbMtd, idbRaw, idbTime] = await Promise.all([
      idbGet(MTD_CACHE_KEY),
      idbGet(RAW_CACHE_KEY),
      idbGet(CACHE_TIME_KEY),
    ])
    if (idbMtd && idbRaw) {
      mtdRaw = JSON.stringify(idbMtd)
      rawRaw = JSON.stringify(idbRaw)
      timeStr = idbTime ? String(idbTime) : null
    }
  }

  return { mtdRaw, rawRaw, timeStr }
}

/**
 * Get cached data — tries localStorage first, then IndexedDB.
 */
export async function getCachedData() {
  try {
    const { mtdRaw, rawRaw, timeStr } = await readCache()

    if (!mtdRaw && !rawRaw) return { ...EMPTY, source: 'none', timestamp: null }

    const mtd = mtdRaw ? JSON.parse(mtdRaw) : { headers: [], rows: [], objects: [] }
    const raw = rawRaw ? JSON.parse(rawRaw) : { headers: [], rows: [], objects: [] }
    const timestamp = timeStr ? new Date(Number(timeStr)) : null

    const age = timestamp ? Date.now() - timestamp.getTime() : Infinity
    const source = age > CACHE_MAX_AGE ? 'stale-cache' : 'cache'

    return { mtd, raw, source, timestamp }
  } catch {
    return { ...EMPTY, source: 'none', timestamp: null }
  }
}
