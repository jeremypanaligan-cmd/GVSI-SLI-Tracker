import { parseCSV } from './csvParser'
import { idbGet, idbSet, idbKeys, idbRemoveMany } from './idbCache'
import { mergeArchiveIntoCsv } from './archiveFetcher'
import { recordSheetRead } from './dataSourceDiagnostics'
import { PLANS, PLAN_ORDER, DEFAULT_PLAN } from '../config/plans'
import { APP_VERSION } from './version.js'

// Versioned by the app version, so a release retires the previous cache set automatically
const CACHE_VERSION = `v${APP_VERSION}`
const CACHE_MAX_AGE = 1000 * 60 * 5 // 5 minutes

/**
 * Build plan-scoped cache keys.
 * e.g. gvsi_mtd_fiberx_v8, gvsi_raw_bida_v8, gvsi_aging_sme_v8
 */
function cacheKeys(planId) {
  return {
    mtd: `gvsi_mtd_${planId}_${CACHE_VERSION}`,
    raw: `gvsi_raw_${planId}_${CACHE_VERSION}`,
    aging: `gvsi_aging_${planId}_${CACHE_VERSION}`,
    trend: `gvsi_trend_${planId}_${CACHE_VERSION}`,
    time: `gvsi_time_${planId}_${CACHE_VERSION}`,
  }
}

/**
 * Retired cache versions are swept rather than hand-listed, so bumping the version in
 * package.json is all a release needs. Swept keys are the ones that look like a data
 * cache key but are not part of the current set — in BOTH stores.
 */
const currentCacheKeys = new Set(
  PLAN_ORDER.flatMap((planId) => Object.values(cacheKeys(planId)))
)

// Keys from before keys were plan-scoped — they don't follow the prefix + version shape
const LEGACY_CACHE_KEYS = [
  'gvsi_mtd_data', 'gvsi_raw_data', 'gvsi_data_time',
  'gvsi_sli_data', 'gvsi_sli_data_time',
]
const CACHE_KEY_PREFIXES = ['gvsi_mtd_', 'gvsi_raw_', 'gvsi_aging_', 'gvsi_time_', 'gvsi_arch_', 'gvsi_trend_']

function isRetiredCacheKey(key) {
  if (currentCacheKeys.has(key)) return false
  if (LEGACY_CACHE_KEYS.includes(key)) return true
  return CACHE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

// localStorage is synchronous and cheap — swept on every load
// (theme / plan / view state keys don't match, so user preferences are untouched)
try {
  Object.keys(localStorage).filter(isRetiredCacheKey).forEach((key) => localStorage.removeItem(key))
} catch { /* ignore */ }

// IndexedDB mirrors the same keys (it's the localStorage quota fallback) and costs a
// database round-trip, so it is swept once per cache version instead of on every load.
const IDB_PURGE_MARKER = 'gvsi_idb_purged'
try {
  if (typeof indexedDB !== 'undefined' && localStorage.getItem(IDB_PURGE_MARKER) !== CACHE_VERSION) {
    idbKeys()
      .then((keys) => {
        const retired = keys.filter(isRetiredCacheKey)
        return retired.length ? idbRemoveMany(retired) : null
      })
      .then(() => {
        try { localStorage.setItem(IDB_PURGE_MARKER, CACHE_VERSION) } catch { /* ignore */ }
      })
      .catch(() => { /* ignore */ })
  }
} catch { /* ignore */ }

/**
 * Save to localStorage; if quota exceeded, fall back to IndexedDB.
 * Cache keys are scoped by planId.
 */
async function saveCache(planId, mtd, raw, aging, trend) {
  const keys = cacheKeys(planId)
  try {
    localStorage.setItem(keys.mtd, JSON.stringify(mtd))
    localStorage.setItem(keys.raw, JSON.stringify(raw))
    localStorage.setItem(keys.aging, JSON.stringify(aging || { headers: [], rows: [], objects: [] }))
    localStorage.setItem(keys.trend, JSON.stringify(trend || { headers: [], rows: [], objects: [] }))
    localStorage.setItem(keys.time, Date.now().toString())
  } catch {
    console.warn(`[Cache] localStorage full for ${planId}, saving to IndexedDB`)
    await Promise.all([
      idbSet(keys.mtd, mtd),
      idbSet(keys.raw, raw),
      idbSet(keys.aging, aging || { headers: [], rows: [], objects: [] }),
      idbSet(keys.trend, trend || { headers: [], rows: [], objects: [] }),
      idbSet(keys.time, Date.now()),
    ])
  }
}

/**
 * Read cache from localStorage, falling back to IndexedDB if empty.
 * Cache keys are scoped by planId.
 */
async function readCache(planId) {
  const keys = cacheKeys(planId)
  let mtdRaw = null
  let rawRaw = null
  let agingRaw = null
  let trendRaw = null
  let timeStr = null

  // 1) Try localStorage first
  try {
    mtdRaw = localStorage.getItem(keys.mtd)
    rawRaw = localStorage.getItem(keys.raw)
    agingRaw = localStorage.getItem(keys.aging)
    trendRaw = localStorage.getItem(keys.trend)
    timeStr = localStorage.getItem(keys.time)
  } catch { /* ignore */ }

  // 2) If localStorage is empty, try IndexedDB
  if (!mtdRaw && !rawRaw) {
    const [idbMtd, idbRaw, idbAging, idbTrend, idbTime] = await Promise.all([
      idbGet(keys.mtd),
      idbGet(keys.raw),
      idbGet(keys.aging),
      idbGet(keys.trend),
      idbGet(keys.time),
    ])
    if (idbMtd && idbRaw) {
      mtdRaw = JSON.stringify(idbMtd)
      rawRaw = JSON.stringify(idbRaw)
      agingRaw = idbAging ? JSON.stringify(idbAging) : null
      trendRaw = idbTrend ? JSON.stringify(idbTrend) : null
      timeStr = idbTime ? String(idbTime) : null
    }
  }

  return { mtdRaw, rawRaw, agingRaw, trendRaw, timeStr }
}

const EMPTY = {
  mtd: { headers: [], rows: [], objects: [] },
  raw: { headers: [], rows: [], objects: [] },
  aging: { headers: [], rows: [], objects: [] },
  trend: { headers: [], rows: [], objects: [] },
}

/**
 * Get cached data for a specific plan — tries localStorage first, then IndexedDB.
 *
 * `selectedMonthYear` is only used to decide which archived month of raw rows to fold
 * in (`mergeArchiveIntoCsv`), so the right half of a month boundary is present.
 */
export async function getCachedData(planId = DEFAULT_PLAN, selectedMonthYear) {
  try {
    const { mtdRaw, rawRaw, agingRaw, trendRaw, timeStr } = await readCache(planId)

    if (!mtdRaw && !rawRaw) {
      recordSheetRead(planId, { source: 'none', mtdBytes: 0, rawBytes: 0, mtdRows: 0, rawRows: 0 })
      return { ...EMPTY, source: 'none', timestamp: null }
    }

    const mtd = mtdRaw ? JSON.parse(mtdRaw) : { headers: [], rows: [], objects: [] }
    const raw = rawRaw ? JSON.parse(rawRaw) : { headers: [], rows: [], objects: [] }
    const aging = agingRaw ? JSON.parse(agingRaw) : { headers: [], rows: [], objects: [] }
    const trend = trendRaw ? JSON.parse(trendRaw) : { headers: [], rows: [], objects: [] }
    const timestamp = timeStr ? new Date(Number(timeStr)) : null

    const age = timestamp ? Date.now() - timestamp.getTime() : Infinity
    const source = age > CACHE_MAX_AGE ? 'stale-cache' : 'cache'

    // Sizes come from what this tab actually holds; `source` says whether that is a
    // fresh export or a copy of one.
    recordSheetRead(planId, {
      source,
      cachedAt: timestamp ? timestamp.getTime() : null,
      cacheAgeMs: Number.isFinite(age) ? age : null,
      mtdBytes: mtdRaw ? mtdRaw.length : 0,
      rawBytes: rawRaw ? rawRaw.length : 0,
      mtdRows: mtd.rows.length,
      rawRows: raw.rows.length,
    })

    // Archived months are cached separately (forever) and folded in on read, so the
    // sheet cache holds one copy of the data and never grows with the archive.
    const merged = await mergeArchiveIntoCsv(planId, { mtd, raw }, selectedMonthYear)

    return { mtd: merged.mtd, raw: merged.raw, aging, trend, source, timestamp }
  } catch {
    return { ...EMPTY, source: 'none', timestamp: null }
  }
}

/**
 * Fetch both MTD and RAW DATA sheets for a specific plan.
 * Returns { mtd, raw, aging, trend, source, timestamp }
 */
export async function fetchAllData(planId = DEFAULT_PLAN, selectedMonthYear) {
  const plan = PLANS[planId]
  if (!plan) throw new Error(`Unknown plan: ${planId}`)

  const isOnline = navigator.onLine
  const bust = '&t=' + Date.now()

  if (isOnline) {
    try {
      const [mtdRes, rawRes] = await Promise.all([
        fetch(plan.mtdUrl + bust, { cache: 'no-store' }),
        fetch(plan.rawUrl + bust, { cache: 'no-store' }),
      ])

      if (!mtdRes.ok) throw new Error(`MTD HTTP ${mtdRes.status}`)
      if (!rawRes.ok) throw new Error(`RAW HTTP ${rawRes.status}`)

      const [mtdText, rawText] = await Promise.all([
        mtdRes.text(),
        rawRes.text(),
      ])

      const mtd = parseCSV(mtdText)
      const raw = parseCSV(rawText)

      // Recorded before the archive merge, so these figures are the sheet export alone
      // — the thing that has to stay flat as the archive grows.
      recordSheetRead(planId, {
        source: 'live',
        liveError: null,
        fetchedAt: Date.now(),
        cachedAt: null,
        cacheAgeMs: null,
        mtdBytes: mtdText.length,
        rawBytes: rawText.length,
        mtdRows: mtd.rows.length,
        rawRows: raw.rows.length,
      })

      // Best-effort: COMPLETED AGING REPORT (Installation SLA Breakdown) is a
      // shared, plan-agnostic report whose data currently lives in the FIBERX
      // sheet — fetched regardless of the active plan. Never fails the main load.
      let aging = { headers: [], rows: [], objects: [] }
      try {
        const agingRes = await fetch(PLANS.fiberx.agingUrl + bust, { cache: 'no-store' })
        if (agingRes.ok) {
          aging = parseCSV(await agingRes.text())
        }
      } catch { /* aging is optional */ }

      // Best-effort: 30-day trend data from dedicated sheet — plan-specific.
      let trend = { headers: [], rows: [], objects: [] }
      try {
        const trendRes = await fetch(plan.trendUrl + bust, { cache: 'no-store' })
        if (trendRes.ok) {
          trend = parseCSV(await trendRes.text())
        }
      } catch { /* trend is optional */ }

      // Cache the sheet data only — archived rows live in their own forever-cache, so
      // only one copy of any month is ever stored.
      await saveCache(planId, mtd, raw, aging, trend)

      const merged = await mergeArchiveIntoCsv(planId, { mtd, raw }, selectedMonthYear)

      return { mtd: merged.mtd, raw: merged.raw, aging, trend, source: 'live', timestamp: new Date() }
    } catch (err) {
      const hint = err.message.includes('401') 
        ? ` — Sheet may not be published. Open the Google Sheet → File → Share → Publish to web.`
        : ''
      recordSheetRead(planId, { source: 'error', liveError: err.message, failedAt: Date.now() })
      console.warn(`[Fetch] Live fetch failed for ${planId}${hint}`, err.message)
    }
  }

  return await getCachedData(planId, selectedMonthYear)
}

let prefetchPromise = null

/**
 * Background-prefetch RAW + MTD data for every non-active plan and store it
 * in the plan-scoped cache. Skips plans whose cache is still fresh (within
 * CACHE_MAX_AGE) so we don't hammer Google's export endpoints on every load.
 *
 * Dedupe guard: concurrent calls share one in-flight run; the promise resets
 * once it settles. Never throws — failures are logged and ignored.
 */
export async function prefetchAllPlans(activePlanId = DEFAULT_PLAN, selectedMonthYear) {
  if (prefetchPromise) return prefetchPromise

  prefetchPromise = (async () => {
    const jobs = PLAN_ORDER
      .filter(id => id !== activePlanId)
      .map(async (planId) => {
        try {
          const cached = await getCachedData(planId, selectedMonthYear)
          const fresh = cached.timestamp && (Date.now() - cached.timestamp.getTime()) < CACHE_MAX_AGE
          if (fresh) return { planId, status: 'fresh' }
          const result = await fetchAllData(planId, selectedMonthYear)
          return { planId, status: result.source === 'live' ? 'prefetched' : 'cached' }
        } catch (err) {
          console.warn(`[Prefetch] ${planId} failed:`, err.message)
          return { planId, status: 'failed' }
        }
      })
    return Promise.all(jobs)
  })().finally(() => {
    prefetchPromise = null
  })

  return prefetchPromise
}
