/**
 * Where the dashboard's data actually came from.
 *
 * Three readers feed this: the Google Sheet export, the Supabase archive, and the
 * per-plan cache that sits in front of the sheet. Every read writes one line here and
 * the Developer console renders it, so "is this number from the sheet or from
 * Postgres?" stops being a question you answer with DevTools.
 *
 * Nothing in the data path depends on this module — every entry point is a plain
 * function call whose result is discarded. A bug here can make the panel wrong, but it
 * cannot change what the dashboard shows.
 *
 * State is per browser tab and never persisted: it describes the reads this tab made,
 * which is exactly the question being asked.
 */

/** planId → { sheet, archive, merge, dependency, at } */
const planState = new Map()

/**
 * The year tabs (`YTD 2026` / `TARGET 2026`) are shared by every plan, so they get their
 * own slot rather than one per plan — reading them once is the point of the 24h cache.
 */
let yearState = null

function entry(planId) {
  let value = planState.get(planId)
  if (!value) {
    value = { sheet: null, archive: null, merge: null, dependency: null, at: null }
    planState.set(planId, value)
  }
  return value
}

/**
 * Payload size in bytes — the string length when we have the raw body, otherwise the
 * JSON serialisation of a row array. This measures the payload, not the storage: a
 * cached month reports the same figure as a fetched one, with `fromCache` saying which
 * it was.
 */
export function payloadBytes(value) {
  if (typeof value === 'string') return value.length
  if (value === null || value === undefined) return 0
  try {
    return JSON.stringify(value).length
  } catch {
    return 0
  }
}

/** The sheet export: what was requested, how big it was, and how it ended up. */
export function recordSheetRead(planId, patch) {
  const current = entry(planId)
  current.sheet = { ...(current.sheet || {}), ...patch }
  current.at = Date.now()
}

/** The archived month list (`sli_mtd` where is_overall_total) that drives the merge. */
export function recordArchiveIndex(planId, patch) {
  const current = entry(planId)
  const archive = current.archive || { index: null, months: {} }
  archive.index = { ...(archive.index || {}), ...patch }
  current.archive = archive
  current.at = Date.now()
}

/** One archived month's rows, merged into the archive record by month key. */
export function recordArchiveMonth(planId, monthKey, patch) {
  const current = entry(planId)
  const archive = current.archive || { index: null, months: {} }
  archive.months[monthKey] = { monthKey, ...(archive.months[monthKey] || {}), ...patch }
  current.archive = archive
  current.at = Date.now()
}

/** The merge: how many rows each side of the split ended up contributing. */
export function recordMerge(planId, patch) {
  const current = entry(planId)
  current.merge = { ...(current.merge || {}), ...patch }
  current.at = Date.now()
}

/**
 * Who supplied the year-to-date actuals — the tracker's own record or the `YTD 2026`
 * worksheet — for one plan. Computed by `summarizeWorksheetDependency`, which is pure;
 * this only stores the snapshot for the console to render.
 */
export function recordYearDependency(planId, report) {
  const current = entry(planId)
  current.dependency = report || null
  current.at = Date.now()
}

/** The shared year tabs: whether the YTD/target tables came from the sheet or the cache. */
export function recordYearTables(patch) {
  yearState = { ...(yearState || {}), ...patch, at: Date.now() }
}

export function clearDiagnostics() {
  planState.clear()
  yearState = null
}

/**
 * A snapshot for rendering. Values are shallow-copied so a re-render triggered by a
 * later read cannot mutate what is on screen.
 */
export function getDiagnostics() {
  const plans = {}
  for (const [planId, value] of planState) {
    plans[planId] = {
      sheet: value.sheet ? { ...value.sheet } : null,
      archive: value.archive
        ? {
            index: value.archive.index ? { ...value.archive.index } : null,
            months: Object.fromEntries(
              Object.entries(value.archive.months || {}).map(([key, month]) => [key, { ...month }]),
            ),
          }
        : null,
      merge: value.merge ? { ...value.merge } : null,
      dependency: value.dependency
        ? {
            ...value.dependency,
            areas: (value.dependency.areas || []).map((area) => ({
              ...area,
              worksheetMonths: [...area.worksheetMonths],
              recordMonths: [...area.recordMonths],
            })),
            monthDetail: (value.dependency.monthDetail || []).map((month) => ({
              ...month,
              worksheetAreas: [...month.worksheetAreas],
              recordAreas: [...month.recordAreas],
            })),
            totals: value.dependency.totals
              ? {
                  ...value.dependency.totals,
                  worksheetMonths: [...value.dependency.totals.worksheetMonths],
                  recordMonths: [...value.dependency.totals.recordMonths],
                  fullyWorksheetMonths: [...value.dependency.totals.fullyWorksheetMonths],
                  areasWithNoRecord: [...value.dependency.totals.areasWithNoRecord],
                  permanentWorksheetMonths: [...value.dependency.totals.permanentWorksheetMonths],
                }
              : null,
          }
        : null,
      at: value.at,
    }
  }
  return { plans, year: yearState ? { ...yearState } : null }
}
