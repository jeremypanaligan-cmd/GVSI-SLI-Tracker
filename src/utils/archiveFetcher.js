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

const indexKey = (planId) => `${CACHE_PREFIX}idx_${planId}_${CACHE_VERSION}`
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

  if (!force && cached && Date.now() - (cached.at || 0) < INDEX_TTL) {
    recordArchiveIndex(planId, { fromCache: true, months: cachedLabels, fetchedAt: cached.at || null, error: null })
    return cached.months || []
  }

  try {
    const months = await supabaseGet(
      `sli_mtd?plan=eq.${planId}&is_overall_total=eq.true` +
      '&select=month_key,month_label&order=month_key.asc'
    )
    await writeJson(key, { at: Date.now(), months })
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

async function fetchMonthMtdRows(planId, monthKey) {
  const key = mtdKey(planId, monthKey)
  const cached = await readJson(key)
  if (cached) {
    recordArchiveMonth(planId, monthKey, {
      mtdFromCache: true,
      mtdRows: cached.rows.length,
      mtdBytes: payloadBytes(cached.rows),
    })
    return cached.rows
  }

  const rows = await supabaseGet(
    `sli_mtd?plan=eq.${planId}&month_key=eq.${monthKey}` +
    `&select=area,row_order,${selectList(MTD_FIELDS)}&order=row_order.asc`
  )
  await writeJson(key, { rows })
  recordArchiveMonth(planId, monthKey, {
    mtdFromCache: false,
    mtdRows: rows.length,
    mtdBytes: payloadBytes(rows),
  })
  return rows
}

async function fetchMonthRawRows(planId, monthKey) {
  const key = rawKey(planId, monthKey)
  const cached = await readJson(key)
  if (cached) {
    recordArchiveMonth(planId, monthKey, {
      rawFromCache: true,
      rawRows: cached.rows.length,
      rawBytes: payloadBytes(cached.rows),
    })
    return cached.rows
  }

  const rows = await supabaseGet(
    `sli_raw_daily?plan=eq.${planId}&month_key=eq.${monthKey}` +
    `&select=date_label,area,report_date,row_order,${selectList(RAW_FIELDS)}` +
    '&order=report_date.asc,row_order.asc'
  )
  await writeJson(key, { rows })
  recordArchiveMonth(planId, monthKey, {
    rawFromCache: false,
    rawRows: rows.length,
    rawBytes: payloadBytes(rows),
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
