import { parseCSV } from './csvParser'
import { idbGet, idbSet } from './idbCache'
import { PLANS, PLAN_ORDER, DEFAULT_PLAN } from '../config/plans'

const CACHE_VERSION = 'v7'
const CACHE_MAX_AGE = 1000 * 60 * 5 // 5 minutes

/**
 * Build plan-scoped cache keys.
 * e.g. gvsi_mtd_fiberx_v7, gvsi_raw_bida_v7, gvsi_aging_sme_v7
 */
function cacheKeys(planId) {
  return {
    mtd: `gvsi_mtd_${planId}_${CACHE_VERSION}`,
    raw: `gvsi_raw_${planId}_${CACHE_VERSION}`,
    aging: `gvsi_aging_${planId}_${CACHE_VERSION}`,
    time: `gvsi_time_${planId}_${CACHE_VERSION}`,
  }
}

// Clear ALL old cache versions (plan-agnostic and old versioned)
try {
  const oldKeys = [
    'gvsi_mtd_data', 'gvsi_raw_data', 'gvsi_data_time',
    'gvsi_mtd_data_v2', 'gvsi_raw_data_v2', 'gvsi_data_time_v2',
    'gvsi_mtd_data_v3', 'gvsi_raw_data_v3', 'gvsi_data_time_v3',
    'gvsi_mtd_data_v4', 'gvsi_raw_data_v4', 'gvsi_data_time_v4',
    'gvsi_mtd_data_v5', 'gvsi_raw_data_v5', 'gvsi_data_time_v5',
    'gvsi_mtd_data_v6', 'gvsi_raw_data_v6', 'gvsi_data_time_v6',
    'gvsi_mtd_fiberx_v6', 'gvsi_raw_fiberx_v6', 'gvsi_time_fiberx_v6',
    'gvsi_mtd_bida_v6', 'gvsi_raw_bida_v6', 'gvsi_time_bida_v6',
    'gvsi_mtd_sme_v6', 'gvsi_raw_sme_v6', 'gvsi_time_sme_v6',
    'gvsi_sli_data', 'gvsi_sli_data_time',
  ]
  oldKeys.forEach(k => localStorage.removeItem(k))
} catch { /* ignore */ }

/**
 * Save to localStorage; if quota exceeded, fall back to IndexedDB.
 * Cache keys are scoped by planId.
 */
async function saveCache(planId, mtd, raw, aging) {
  const keys = cacheKeys(planId)
  try {
    localStorage.setItem(keys.mtd, JSON.stringify(mtd))
    localStorage.setItem(keys.raw, JSON.stringify(raw))
    localStorage.setItem(keys.aging, JSON.stringify(aging || { headers: [], rows: [], objects: [] }))
    localStorage.setItem(keys.time, Date.now().toString())
  } catch {
    console.warn(`[Cache] localStorage full for ${planId}, saving to IndexedDB`)
    await Promise.all([
      idbSet(keys.mtd, mtd),
      idbSet(keys.raw, raw),
      idbSet(keys.aging, aging || { headers: [], rows: [], objects: [] }),
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
  let timeStr = null

  // 1) Try localStorage first
  try {
    mtdRaw = localStorage.getItem(keys.mtd)
    rawRaw = localStorage.getItem(keys.raw)
    agingRaw = localStorage.getItem(keys.aging)
    timeStr = localStorage.getItem(keys.time)
  } catch { /* ignore */ }

  // 2) If localStorage is empty, try IndexedDB
  if (!mtdRaw && !rawRaw) {
    const [idbMtd, idbRaw, idbAging, idbTime] = await Promise.all([
      idbGet(keys.mtd),
      idbGet(keys.raw),
      idbGet(keys.aging),
      idbGet(keys.time),
    ])
    if (idbMtd && idbRaw) {
      mtdRaw = JSON.stringify(idbMtd)
      rawRaw = JSON.stringify(idbRaw)
      agingRaw = idbAging ? JSON.stringify(idbAging) : null
      timeStr = idbTime ? String(idbTime) : null
    }
  }

  return { mtdRaw, rawRaw, agingRaw, timeStr }
}

const EMPTY = {
  mtd: { headers: [], rows: [], objects: [] },
  raw: { headers: [], rows: [], objects: [] },
  aging: { headers: [], rows: [], objects: [] },
}

/**
 * Get cached data for a specific plan — tries localStorage first, then IndexedDB.
 */
export async function getCachedData(planId = DEFAULT_PLAN) {
  try {
    const { mtdRaw, rawRaw, agingRaw, timeStr } = await readCache(planId)

    if (!mtdRaw && !rawRaw) return { ...EMPTY, source: 'none', timestamp: null }

    const mtd = mtdRaw ? JSON.parse(mtdRaw) : { headers: [], rows: [], objects: [] }
    const raw = rawRaw ? JSON.parse(rawRaw) : { headers: [], rows: [], objects: [] }
    const aging = agingRaw ? JSON.parse(agingRaw) : { headers: [], rows: [], objects: [] }
    const timestamp = timeStr ? new Date(Number(timeStr)) : null

    const age = timestamp ? Date.now() - timestamp.getTime() : Infinity
    const source = age > CACHE_MAX_AGE ? 'stale-cache' : 'cache'

    return { mtd, raw, aging, source, timestamp }
  } catch {
    return { ...EMPTY, source: 'none', timestamp: null }
  }
}

/**
 * Fetch both MTD and RAW DATA sheets for a specific plan.
 * Returns { mtd, raw, aging, source, timestamp }
 */
export async function fetchAllData(planId = DEFAULT_PLAN) {
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

      // Cache fresh data (plan-scoped)
      await saveCache(planId, mtd, raw, aging)

      return { mtd, raw, aging, source: 'live', timestamp: new Date() }
    } catch (err) {
      const hint = err.message.includes('401') 
        ? ` — Sheet may not be published. Open the Google Sheet → File → Share → Publish to web.`
        : ''
      console.warn(`[Fetch] Live fetch failed for ${planId}${hint}`, err.message)
    }
  }

  return await getCachedData(planId)
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
export async function prefetchAllPlans(activePlanId = DEFAULT_PLAN) {
  if (prefetchPromise) return prefetchPromise

  prefetchPromise = (async () => {
    const jobs = PLAN_ORDER
      .filter(id => id !== activePlanId)
      .map(async (planId) => {
        try {
          const cached = await getCachedData(planId)
          const fresh = cached.timestamp && (Date.now() - cached.timestamp.getTime()) < CACHE_MAX_AGE
          if (fresh) return { planId, status: 'fresh' }
          const result = await fetchAllData(planId)
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
