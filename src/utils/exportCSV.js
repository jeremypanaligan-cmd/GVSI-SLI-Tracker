/**
 * Export RAW DATA as a downloadable CSV file.
 * Reconstructs CSV from the parsed blocks data in memory.
 *
 * The Year-to-Date table exports through `buildYtdCSV` / `exportYtdCSV` at the bottom of this
 * file. That pair is split in two on purpose — the string is built by a pure function so it can
 * be called with fixed input and checked, the same way `yearTables.js` is kept pure — and both
 * live here so the app has one place that knows how a CSV leaves it.
 */

import { getPaceBadgeStyle } from './dataProcessor'

const HEADERS = [
  'Date', 'AREA', 'BF', 'INC', 'Total Jo',
  'COMPLETED FROM TOTAL', 'COMPLETED FROM RJO', 'TOTAL COMPLETED',
  'RJO INCOMING', 'RJO REDISPATCHED', 'TOTAL RJO',
  'Carry Over', 'MTD', 'GROSS', 'NET', 'TARGET', '%'
]

/**
 * Escape a CSV field value (quote if contains comma, quote, or newline).
 */
function esc(val) {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/**
 * Convert a numeric value to a raw number string for CSV.
 */
function num(val) {
  if (val === null || val === undefined || val === '' || val === '—') return ''
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[,]/g, ''))
  return isNaN(n) ? '' : String(n)
}

/**
 * Export all RAW DATA blocks as a CSV file download.
 * @param {Object} rawDaily - parsed daily data { dates: string[], blocks: { [date]: { areas: [...], overallTotal } } }
 */
export function exportRawDataCSV(rawDaily, planId = 'fiberx') {
  if (!rawDaily || !rawDaily.dates || rawDaily.dates.length === 0) {
    alert('No data available to export.')
    return
  }

  const rows = [HEADERS.join(',')]

  for (const dateStr of rawDaily.dates) {
    const block = rawDaily.blocks[dateStr]
    if (!block) continue

    // Area rows first
    if (block.areas) {
      for (const area of block.areas) {
        rows.push([
          esc(dateStr),
          esc(area.area),
          num(area.bf),
          num(area.inc),
          num(area.totalJo),
          num(area.completedFromTotal),
          num(area.completedFromRjo),
          num(area.totalCompleted),
          num(area.rjoIncoming),
          num(area.rjoRedispatched),
          num(area.totalRjo),
          num(area.carryOver),
          num(area.mtd),
          num(area.gross),
          num(area.net),
          num(area.target),
          num(area.pct),
        ].join(','))
      }
    }

    // OVER ALL TOTAL row
    if (block.overallTotal) {
      const t = block.overallTotal
      rows.push([
        esc(dateStr),
        esc('OVER ALL TOTAL'),
        num(t.bf),
        num(t.inc),
        num(t.totalJo),
        num(t.completedFromTotal),
        num(t.completedFromRjo),
        num(t.totalCompleted),
        num(t.rjoIncoming),
        num(t.rjoRedispatched),
        num(t.totalRjo),
        num(t.carryOver),
        num(t.mtd),
        num(t.gross),
        num(t.net),
        num(t.target),
        num(t.pct),
      ].join(','))
    }
  }

  const csv = rows.join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `SLI_${planId.toUpperCase()}_RAW_DATA_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ==================== YEAR-TO-DATE ====================

/**
 * The Provincial Year-to-Date table, column for column — see `YtdTable.jsx`. `PLAN` and
 * `THROUGH` lead every row so the file still says what it is once the filename is gone, which is
 * what happens as soon as anyone pastes it into a sheet beside another plan's export.
 */
const YTD_HEADERS = [
  'PLAN', 'THROUGH', 'AREA', 'YTD', 'PLAN TO DATE', '% OF PLAN', 'ANNUAL TGT', '% OF TGT',
  'REMAINING', 'REQ / MO', 'PROJ', 'PACE',
]

/**
 * Two decimals at most, and integers stay integers. Percentages and monthly rates are ratios, so
 * they are the only cells with digits worth keeping; writing 64.89510489510489 would be noise, and
 * flattening to the table's own rounding would throw away the fraction a reader may want to check.
 */
function round2(val) {
  if (typeof val !== 'number' || !Number.isFinite(val)) return ''
  return String(Math.round(val * 100) / 100)
}

/** The PACE cell as it reads on screen: the verdict, or the reason there is none. */
function paceText(row) {
  if (row.pace) return getPaceBadgeStyle(row.pace).label
  return row.paceNote || ''
}

/**
 * The Year-to-Date table as a CSV string.
 *
 * Always every province, never the rows left by a pace filter: the `OVER ALL TOTAL` row covers all
 * of them, so a filtered file would contradict its own total.
 *
 * @param {object} ytd     `computeYtd`'s result — carries the plan, year and month itself
 * @param {object} [meta]  `{ planName }`, for the human-readable plan label
 * @returns {string} '' when there is nothing to export
 */
export function buildYtdCSV(ytd, meta = {}) {
  if (!ytd || (!ytd.areas?.length && !ytd.overall)) return ''

  const plan = String(meta.planName || ytd.planId || '').toUpperCase()
  const month = ytd.monthIndex == null ? '' : String(ytd.monthIndex + 1).padStart(2, '0')
  const through = ytd.year ? `${ytd.year}-${month}` : month

  const rows = [YTD_HEADERS.join(',')]
  const lines = [...(ytd.areas || [])]
  if (ytd.overall) lines.push(ytd.overall)

  for (const row of lines) {
    rows.push([
      esc(plan),
      esc(through),
      // Trimmed: the target tab writes `Mountain Province ` with a trailing space, and in a
      // spreadsheet that space is a value of its own.
      esc(String(row.name ?? '').trim()),
      round2(row.ytd),
      round2(row.planToDate),
      round2(row.pctOfPlan),
      round2(row.annualTarget),
      round2(row.pct),
      round2(row.remaining),
      round2(row.requiredPerMonth),
      round2(row.projected),
      esc(paceText(row)),
    ].join(','))
  }

  return rows.join('\n')
}

/**
 * Download the Year-to-Date table as a CSV file.
 *
 * @param {object} ytd     `computeYtd`'s result
 * @param {object} [meta]  `{ planName }`
 */
export function exportYtdCSV(ytd, meta = {}) {
  const csv = buildYtdCSV(ytd, meta)
  if (!csv) {
    alert('No year-to-date data available to export.')
    return
  }

  const plan = String(meta.planName || ytd.planId || 'plan').toUpperCase()
  const month = ytd.monthIndex == null ? '' : `-${String(ytd.monthIndex + 1).padStart(2, '0')}`
  const through = ytd.year ? `${ytd.year}${month}` : month.replace(/^-/, '')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `SLI_${plan}_YTD_${through}_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
