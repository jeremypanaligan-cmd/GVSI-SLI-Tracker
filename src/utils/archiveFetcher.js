import { idbGet, idbSet, idbKeys, idbRemoveMany } from './idbCache'
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_ENABLED } from '../config/supabase'
import { normalizeRawDate, getCurrentMonthYear } from './dataProcessor'
import { APP_VERSION } from './version.js'
import {
  recordArchiveIndex,
  recordArchiveMonth,
  recordMerge,
  payloadBytes,
} from './dataSourceDiagnostics'

/**
 * Cold archive reads: months that have already been archived to Supabase and purged
 * from the plan's `NEW REPORT` sheet.
 *
 * The merge deliberately happens on RAW CSV ROWS, before parsing, so `dataProcessor`
 * needs no knowledge of Supabase at all. A month coming from Postgres is rendered
 * back into exactly the row shape the Google Sheet export produces — same column
 * order, same 'September 1, 2026' date key, same '91.20%' percent text — and the
 * existing parsers cannot tell the difference.
 *
 * Caching is asymmetric on purpose:
 *   * the month index is cheap but can change (a new month gets archived) → 5 min TTL
 *   * a month's rows are immutable once archived                       → cached forever
 *
 * So the app's Google Sheet payload stays flat as the archive grows: past months are
 * fetched once per browser and never again.
 */

const CACHE_VERSION = `v${APP_VERSION}`
const INDEX_TTL = 1000 * 60 * 5
const CACHE_PREFIX = 'gvsi_arch_'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

// GROSS / NET sit between MTD and TARGET — SME's MRC collection columns. BIDA and FIBERX
// carry no such columns, so their archived rows have them as NULL and the rebuilt cells
// come back empty.
const MTD_COLUMNS = ['AREA', 'COMPLETED FROM TOTAL', 'COMPLETED FROM RJO', 'TOTAL COMPLETED',
  'THIS MO. RJO', 'PREV MOS. RJO', 'TOTAL RJO', 'LAST MTD', 'GROSS', 'NET', 'TARGET',
  'LAST %', 'TOTAL INCOMING']

const RAW_COLUMNS = ['Date', 'AREA', 'BF', 'INC', 'Total Jo', 'COMPLETED FROM TOTAL',
  'COMPLETED FROM RJO', 'TOTAL COMPLETED', 'RJO INCOMING', 'RJO REDISPATCHED', 'TOTAL RJO',
  'Carry Over', 'MTD', 'GROSS', 'NET', 'TARGET', '%']

const MTD_FIELDS = ['comp_from_total', 'comp_from_rjo', 'total_completed', 'this_mo_rjo',
  'prev_mos_rjo', 'total_rjo', 'last_mtd', 'gross', 'net', 'target', 'last_pct', 'total_incoming']

const RAW_FIELDS = ['bf', 'inc', 'total_jo', 'comp_from_total', 'comp_from_rjo', 'total_completed',
  'rjo_incoming', 'rjo_redispatched', 'total_rjo', 'carry_over', 'mtd', 'gross', 'net', 'target', 'pct']

// One Monthly Progress row per plan x month x area: the figure the month delivered in the
// plan's own units, the target it was asked for, and which read put it there — 'archive' for
// the archive job's own projection of a month it verified, 'worksheet' for a month backfilled
// from the shared year tabs (supabase/seed-monthly-progress.sql). The figure is read the same
// either way; the label is what lets the Developer console say which it was.
const MONTHLY_FIELDS = ['month_key', 'month_label', 'area', 'is_overall_total', 'measure',
  'value', 'target', 'row_order', 'source']

const indexKey = (planId) => `${CACHE_PREFIX}idx_${planId}_${CACHE_VERSION}`
const monthlyKey = (planId) => `${CACHE_PREFIX}mon_${planId}_${CACHE_VERSION}`
const mtdKey = (planId, monthKey) => `${CACHE_PREFIX}mtd_${planId}_${monthKey}_${CACHE_VERSION}`
const rawKey = (planId, monthKey) => `${CACHE_PREFIX}raw_${planId}_${monthKey}_${CACHE_VERSION}`

/** True for a key owned by this module — used by the version sweep in dataFetcher. */
export const isArchiveCacheKey = (key) => String(key).startsWith(CACHE_PREFIX)

// ── Cache (localStorage, IndexedDB as the quota fallback) ─────────────────────

async function readJson(key) {
  let raw = null
  try { raw = localStorage.getItem(key) } catch { /* ignore */ }
  if (raw) {
    try { return JSON.parse(raw) } catch { /* fall through to IndexedDB */ }
  }
  try {
    const fromIdb = await idbGet(key)
    return fromIdb ?? null
  } catch {
    return null
  }
}

async function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return
  } catch { /* quota — mirror to IndexedDB instead */ }
  try { await idbSet(key, value) } catch { /* ignore */ }
}

/**
 * True when a cached payload actually carries rows.
 *
 * A month is immutable once archived, which is why its rows are cached forever — but that
 * is only safe if what was cached is an *answer*. `{ rows: [] }` is not: it is a read that
 * came back with nothing. A select denied by RLS answers `[]` with HTTP 200 rather than an
 * error, so an empty body can be a permission or outage artefact rather than "this month
 * has no rows". Remembering it freezes the month at nothing for the life of the app
 * version, and since the sheet has already been purged by then nothing else can supply it —
 * which is how a closed month's figure silently reads 0 in the year-to-date strip.
 */
const hasRows = (cached) => Array.isArray(cached?.rows) && cached.rows.length > 0

/** The same rule for the month list: an empty index is a read that found nothing. */
const hasMonths = (cached) => Array.isArray(cached?.months) && cached.months.length > 0

/** Forget a cache entry in both stores. Used to retire a remembered empty read. */
async function dropJson(key) {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
  try { await idbRemoveMany([key]) } catch { /* ignore */ }
}

/**
 * Drops every archived month cache in both stores. Archived rows are only immutable
 * within one app version — a release may reshape them, and the version in the key is
 * what retires them.
 */
export async function clearArchiveCache() {
  try {
    Object.keys(localStorage)
      .filter(isArchiveCacheKey)
      .forEach((key) => localStorage.removeItem(key))
  } catch { /* ignore */ }
  try {
    const keys = await idbKeys()
    const retired = keys.filter(isArchiveCacheKey)
    if (retired.length) await idbRemoveMany(retired)
  } catch { /* ignore */ }
}

// ── PostgREST ────────────────────────────────────────────────────────────────

async function supabaseGet(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Supabase ${response.status} on ${path}`)
  return response.json()
}

const selectList = (fields) => fields.join(',')

// ── Month helpers ────────────────────────────────────────────────────────────

/** '2026-09' → 'September 2026' */
function monthKeyToLabel(monthKey) {
  const [year, month] = String(monthKey || '').split('-')
  const name = MONTH_NAMES[Number(month) - 1]
  return name ? `${name} ${year}` : String(monthKey || '')
}

/** 'September 2026' → '2026-09', or null when the cell is not a month header. */
function monthLabelToKey(monthLabel) {
  const match = String(monthLabel || '').trim().match(/^([A-Za-z]+)\s+(\d{4})$/)
  if (!match) return null
  const index = MONTH_NAMES.findIndex((name) => name.toLowerCase() === match[1].toLowerCase())
  if (index === -1) return null
  return `${match[2]}-${String(index + 1).padStart(2, '0')}`
}

const isMonthLabel = (text) => monthLabelToKey(text) !== null

/** 'September 1, 2026' → 'September 2026' */
function monthLabelFromDateLabel(dateLabel) {
  const match = String(dateLabel || '').match(/^([A-Za-z]+)\s+\d+,\s*(\d{4})$/)
  return match ? `${match[1]} ${match[2]}` : null
}

const blank = (value) => (value === null || value === undefined ? '' : value)

// ── Row builders: Postgres rows → the sheet's exact CSV row shape ────────────

function mtdSectionRows(rows, monthLabel) {
  // Month header row + the header row the parser uses to map columns, then data.
  const out = [[monthLabel], MTD_COLUMNS.slice()]
  const ordered = rows.slice().sort((a, b) => (a.row_order || 0) - (b.row_order || 0))

  for (const row of ordered) {
    out.push([row.area, ...MTD_FIELDS.map((field) => blank(row[field]))])
  }
  return out
}

function rawRowsAndObjects(rows) {
  const out = { rows: [], objects: [] }
  const ordered = rows.slice().sort((a, b) => {
    if (a.report_date !== b.report_date) return a.report_date < b.report_date ? -1 : 1
    return (a.row_order || 0) - (b.row_order || 0)
  })

  for (const row of ordered) {
    const values = [row.date_label, row.area, ...RAW_FIELDS.map((field) => blank(row[field]))]
    const object = {}
    RAW_COLUMNS.forEach((name, index) => { object[name] = values[index] })
    out.rows.push(values)
    out.objects.push(object)
  }
  return out
}

// ── Readers ──────────────────────────────────────────────────────────────────

/**
 * The archived month list, oldest first. Drives the month picker, the MoM delta and
 * the decision about which months the sheet no longer needs to supply.
 */
export async function fetchArchivedMonths(planId, { force = false } = {}) {
  if (!SUPABASE_ENABLED) {
    recordArchiveIndex(planId, { fromCache: false, months: [], error: 'Supabase is not configured.' })
    return []
  }

  const key = indexKey(planId)
  const cached = await readJson(key)
  const cachedLabels = (cached?.months || []).map((month) => month.month_label)

  if (!force && hasMonths(cached) && Date.now() - (cached.at || 0) < INDEX_TTL) {
    recordArchiveIndex(planId, { fromCache: true, months: cachedLabels, fetchedAt: cached.at || null, error: null })
    return cached.months || []
  }

  try {
    const months = await supabaseGet(
      `sli_mtd?plan=eq.${planId}&is_overall_total=eq.true` +
      '&select=month_key,month_label&order=month_key.asc'
    )
    // Same rule one level up: an empty list is reported but not remembered. It is cheap to
    // ask again, and remembering an empty archive would hide every archived month — which
    // reads in the app exactly like "the sheet purged them and nothing replaced them".
    if (months.length) await writeJson(key, { at: Date.now(), months })
    recordArchiveIndex(planId, {
      fromCache: false,
      months: months.map((month) => month.month_label),
      fetchedAt: Date.now(),
      error: null,
    })
    return months
  } catch (error) {
    // A Supabase outage must never blank out the dashboard: fall back to the last
    // known list, and ultimately to the sheet alone.
    console.warn('[Archive] month list unavailable:', error.message)
    recordArchiveIndex(planId, {
      fromCache: Boolean(cached),
      months: cachedLabels,
      fetchedAt: cached?.at || null,
      error: error.message,
    })
    return cached ? cached.months || [] : []
  }
}

/**
 * Every closed month's Monthly Progress figures for one plan: what the year-to-date strip
 * shows for a past month, targets included.
 *
 * Read as one payload rather than a month at a time. The table is small (one row per area
 * per closed month) and always grows at the start, so a whole-plan read costs one request
 * per plan per TTL instead of one per month, and a month that has just been archived
 * arrives with the rest.
 *
 * Cached like the month list: short TTL, because the set of months changes as months close,
 * while the rows inside a month never do. An empty payload is never remembered — see
 * `hasRows`.
 *
 * @returns {Promise<object[]>} the plan's rows, oldest month first
 */
export async function fetchMonthlyProgress(planId, { force = false } = {}) {
  if (!SUPABASE_ENABLED) return []

  const key = monthlyKey(planId)
  const cached = await readJson(key)
  if (!force && hasRows(cached) && Date.now() - (cached.at || 0) < INDEX_TTL) {
    return cached.rows
  }

  try {
    const rows = await supabaseGet(
      `sli_monthly?plan=eq.${planId}&select=${selectList(MONTHLY_FIELDS)}` +
      '&order=month_key.asc,row_order.asc'
    )
    if (rows.length) await writeJson(key, { at: Date.now(), rows })
    return rows
  } catch (error) {
    // The YTD section falls back to the worksheet for every month it cannot read, so this
    // is a degraded read, never a broken dashboard.
    console.warn('[Monthly] progress unavailable:', error.message)
    return cached?.rows || []
  }
}

async function fetchMonthMtdRows(planId, monthKey) {
  const key = mtdKey(planId, monthKey)
  const cached = await readJson(key)
  if (hasRows(cached)) {
    recordArchiveMonth(planId, monthKey, {
      mtdFromCache: true,
      mtdRows: cached.rows.length,
      mtdBytes: payloadBytes(cached.rows),
    })
    return cached.rows
  }
  // A remembered empty read is not a cache hit — drop it and ask again.
  if (cached) await dropJson(key)

  const rows = await supabaseGet(
    `sli_mtd?plan=eq.${planId}&month_key=eq.${monthKey}` +
    `&select=area,row_order,${selectList(MTD_FIELDS)}&order=row_order.asc`
  )
  // Only an answer is cached. An empty read stays unremembered, so the next load asks again
  // instead of inheriting it forever, and it says so in the Developer console.
  if (rows.length) await writeJson(key, { rows })
  recordArchiveMonth(planId, monthKey, {
    mtdFromCache: false,
    mtdRows: rows.length,
    mtdBytes: payloadBytes(rows),
    mtdError: rows.length ? null : 'Supabase returned no MTD rows for this month.',
  })
  return rows
}

async function fetchMonthRawRows(planId, monthKey) {
  const key = rawKey(planId, monthKey)
  const cached = await readJson(key)
  if (hasRows(cached)) {
    recordArchiveMonth(planId, monthKey, {
      rawFromCache: true,
      rawRows: cached.rows.length,
      rawBytes: payloadBytes(cached.rows),
    })
    return cached.rows
  }
  if (cached) await dropJson(key)

  const rows = await supabaseGet(
    `sli_raw_daily?plan=eq.${planId}&month_key=eq.${monthKey}` +
    `&select=date_label,area,report_date,row_order,${selectList(RAW_FIELDS)}` +
    '&order=report_date.asc,row_order.asc'
  )
  if (rows.length) await writeJson(key, { rows })
  recordArchiveMonth(planId, monthKey, {
    rawFromCache: false,
    rawRows: rows.length,
    rawBytes: payloadBytes(rows),
    rawError: rows.length ? null : 'Supabase returned no RAW rows for this month.',
  })
  return rows
}

/**
 * Which archived months of raw rows to pull in.
 *
 * The selected month plus the one before it: the 7-day trend window and the
 * provincial delta both reach back across a month boundary, so the neighbouring month
 * has to be present. When the selected month is still live (the usual case) the newest
 * archived month is used instead — that is the one the boundary reaches into.
 */
function rawMonthsToLoad(monthKeys, selectedMonthYear) {
  const selectedKey = monthLabelToKey(selectedMonthYear)
  const at = monthKeys.indexOf(selectedKey)

  if (at >= 0) {
    return at - 1 >= 0 ? [monthKeys[at - 1], monthKeys[at]] : [monthKeys[at]]
  }
  return monthKeys.length ? [monthKeys[monthKeys.length - 1]] : []
}

// ── Sheet filters: an archived month never comes from both places ────────────

/**
 * Drops month sections from the sheet that the archive also holds. The archive is
 * authoritative for those months, so this stays correct even in the window where the
 * purge has not run yet.
 */
function dropArchivedMtdSections(allRows, archivedLabels) {
  if (!archivedLabels.size) return allRows

  const out = []
  let skipping = false

  for (const row of allRows) {
    const first = String(row?.[0] ?? '').trim()

    if (isMonthLabel(first)) {
      skipping = archivedLabels.has(first)
      if (skipping) continue
    }
    if (skipping) continue
    out.push(row)
  }
  return out
}

/** The month sections a set of sheet MTD rows still contains, in order of appearance. */
function mtdMonthLabels(rows) {
  const labels = []
  for (const row of rows || []) {
    const first = String(row?.[0] ?? '').trim()
    if (isMonthLabel(first) && !labels.includes(first)) labels.push(first)
  }
  return labels
}

/** How many raw rows the sheet still holds per month — normally just the live month. */
function rawMonthCounts(rows) {
  const counts = {}
  for (const row of rows || []) {
    const label = monthLabelFromDateLabel(normalizeRawDate(String(row?.[0] ?? '')))
    if (label) counts[label] = (counts[label] || 0) + 1
  }
  return counts
}

function dropArchivedRawRows(csv, archivedLabels) {
  if (!archivedLabels.size || !csv?.rows?.length) return csv

  const rows = []
  const objects = []
  for (let index = 0; index < csv.rows.length; index++) {
    const label = monthLabelFromDateLabel(normalizeRawDate(String(csv.rows[index]?.[0] ?? '')))
    if (label && archivedLabels.has(label)) continue
    rows.push(csv.rows[index])
    if (csv.objects?.[index]) objects.push(csv.objects[index])
  }
  return { ...csv, rows, objects }
}

// ── The merge ────────────────────────────────────────────────────────────────

/**
 * Returns a copy of `{ mtd, raw }` with archived months folded in. Never throws: on
 * any Supabase trouble the sheet-only data is returned untouched.
 *
 * @param {string} planId
 * @param {{ mtd: object, raw: object }} csv - parsed sheet CSVs
 * @param {string} [selectedMonthYear] - e.g. 'August 2026'
 */
export async function mergeArchiveIntoCsv(planId, csv, selectedMonthYear) {
  if (!SUPABASE_ENABLED || !csv?.mtd || !csv?.raw) return csv

  const selectedMonth = selectedMonthYear || getCurrentMonthYear()

  try {
    const months = await fetchArchivedMonths(planId)
    if (!months.length) {
      // Nothing archived: the sheet is the only source, which is worth showing.
      const sheetMtd = csv.mtd.allRows || csv.mtd.rows || []
      recordMerge(planId, {
        supabaseMtdRows: 0,
        supabaseRawRows: 0,
        supabaseMonths: [],
        sheetMtdRows: sheetMtd.length,
        sheetRawRows: csv.raw.rows?.length || 0,
        sheetMtdMonths: mtdMonthLabels(sheetMtd),
        sheetRawMonths: rawMonthCounts(csv.raw.rows),
      })
      return csv
    }

    // Only months whose rows actually loaded may override the sheet — otherwise a
    // transient fetch failure would look like "this month has no data".
    const loaded = []
    const mtdSections = []
    for (const entry of months) {
      try {
        const rows = await fetchMonthMtdRows(planId, entry.month_key)
        if (!rows.length) continue
        loaded.push(entry)
        mtdSections.push(...mtdSectionRows(rows, entry.month_label))
      } catch (error) {
        console.warn(`[Archive] ${planId} ${entry.month_key} MTD unavailable:`, error.message)
      }
    }
    if (!loaded.length) {
      // Months are listed but none of their rows arrived, so the sheet stays authoritative.
      const sheetMtd = csv.mtd.allRows || csv.mtd.rows || []
      recordMerge(planId, {
        supabaseMtdRows: 0,
        supabaseRawRows: 0,
        supabaseMonths: [],
        sheetMtdRows: sheetMtd.length,
        sheetRawRows: csv.raw.rows?.length || 0,
        sheetMtdMonths: mtdMonthLabels(sheetMtd),
        sheetRawMonths: rawMonthCounts(csv.raw.rows),
      })
      return csv
    }

    const archivedLabels = new Set(loaded.map((entry) => entry.month_label))

    // MTD: archived sections first (oldest first) so the month picker stays in
    // chronological order and the sheet's live month lands last.
    const sheetMtdRows = dropArchivedMtdSections(
      csv.mtd.allRows || csv.mtd.rows || [],
      archivedLabels,
    )
    const mtd = {
      ...csv.mtd,
      allRows: [...mtdSections, ...sheetMtdRows],
      rows: [...mtdSections, ...sheetMtdRows],
    }

    // RAW: only what the current views can reach, so the payload does not grow with
    // the archive. Prepending keeps `dates` ascending — findLatestDataDate walks it
    // from the end.
    const rawRows = []
    for (const monthKey of rawMonthsToLoad(loaded.map((entry) => entry.month_key), selectedMonth)) {
      try {
        rawRows.push(...(await fetchMonthRawRows(planId, monthKey)))
      } catch (error) {
        console.warn(`[Archive] ${planId} ${monthKey} RAW unavailable:`, error.message)
      }
    }

    const archivedRaw = rawRowsAndObjects(rawRows)
    const sheetRaw = dropArchivedRawRows(csv.raw, archivedLabels)
    const raw = {
      ...sheetRaw,
      rows: [...archivedRaw.rows, ...(sheetRaw.rows || [])],
      objects: [...archivedRaw.objects, ...(sheetRaw.objects || [])],
    }

    // The split, as it actually happened: which months each side supplied and how many
    // rows each contributed. `sheetRaw` is post-drop, so these are the rows that really
    // reached the parser.
    recordMerge(planId, {
      supabaseMtdRows: mtdSections.length,
      supabaseRawRows: archivedRaw.rows.length,
      supabaseMonths: loaded.map((entry) => entry.month_label),
      sheetMtdRows: sheetMtdRows.length,
      sheetRawRows: sheetRaw.rows?.length || 0,
      sheetMtdMonths: mtdMonthLabels(sheetMtdRows),
      sheetRawMonths: rawMonthCounts(sheetRaw.rows),
    })

    return { ...csv, mtd, raw }
  } catch (error) {
    console.warn('[Archive] merge skipped:', error.message)
    return csv
  }
}
