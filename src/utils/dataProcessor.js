/**
 * GVSI SLI Tracker — Data Processing Utilities
 *
 * Supports two data sources:
 *   1. MTD Sheet   → Executive Overview metrics
 *   2. RAW DATA    → Daily Status (with date picker)
 */

// ==================== NUMBER UTILITIES ====================

function cleanNumber(val) {
  if (val === null || val === undefined || val === '') return NaN
  if (typeof val === 'number') return val
  let s = String(val).replace(/[,]/g, '')
  const neg = s.startsWith('(') && s.endsWith(')')
  if (neg) s = s.slice(1, -1)
  if (s.endsWith('%')) s = s.slice(0, -1)
  const n = parseFloat(s.trim())
  if (isNaN(n)) return NaN
  return neg ? -n : n
}

export function formatNumber(val, colKey) {
  if (val === null || val === undefined || val === '') return '—'
  if (colKey === '%') {
    const n = cleanNumber(String(val))
    if (isNaN(n)) return val
    return n.toFixed(2) + '%'
  }
  const n = cleanNumber(String(val))
  if (isNaN(n)) return String(val)
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function getBadgeStyle(pctValue) {
  const n = cleanNumber(String(pctValue))
  if (isNaN(n)) return { color: 'text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800', label: '—' }
  if (n >= 100) return { color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/60', border: 'border-emerald-400 dark:border-emerald-500/40', label: 'HIT', pulse: true }
  if (n >= 80) return { color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/60', border: 'border-amber-400 dark:border-amber-500/40', label: 'LAG' }
  return { color: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/60', border: 'border-red-400 dark:border-red-500/40', label: 'MISS' }
}

// ==================== MTD PARSING ====================

const AREAS = [
  'Benguet', 'Ilocos Sur', 'Ilocos Norte', 'Nueva Vizcaya',
  'Isabela', 'Quirino', 'Cagayan', 'Kalinga', 'Abra',
  'Ifugao', 'Apayao', 'Mountain Province'
]

/**
 * Parse MTD sheet CSV rows into structured data for Executive Overview.
 * MTD format: AREA, TOTAL BF, TOTAL INC, TOTAL JO, TOTAL COMPLETED, TOTAL RJO, LAST CARRY OVER, LAST MTD, TARGET, LAST %
 */
export function parseMTDData(mtdRows) {
  if (!mtdRows || mtdRows.length === 0) return null

  // Find the data rows (skip title/header rows)
  let areas = []
  let overallTotal = null

  for (const row of mtdRows) {
    const area = String(row['AREA'] || '').trim()
    if (!area || area === 'AREA' || area.includes('SLI MTD') || area.includes('August') || area.includes('July') || area.includes('September') || area.includes('October') || area.includes('November') || area.includes('December') || area.includes('January') || area.includes('February') || area.includes('March') || area.includes('April') || area.includes('May') || area.includes('June')) continue

    const entry = {
      area,
      totalBf: cleanNumber(row['TOTAL BF']),
      totalInc: cleanNumber(row['TOTAL INC']),
      totalJo: cleanNumber(row['TOTAL JO']),
      totalCompleted: cleanNumber(row['TOTAL COMPLETED']),
      totalRjo: cleanNumber(row['TOTAL RJO']),
      lastCarryOver: cleanNumber(row['LAST CARRY OVER']),
      lastMtd: cleanNumber(row['LAST MTD']),
      target: cleanNumber(row['TARGET']),
      lastPct: cleanNumber(row['LAST %']),
    }

    if (area === 'OVER ALL TOTAL') {
      overallTotal = entry
    } else {
      areas.push(entry)
    }
  }

  return { areas, overallTotal }
}

/**
 * Extract executive KPI metrics from parsed MTD data.
 */
export function extractExecutiveMetrics(mtdData) {
  if (!mtdData || !mtdData.overallTotal) return null
  const ot = mtdData.overallTotal

  return {
    bf: ot.totalBf,
    inc: ot.totalInc,
    total: ot.totalJo,
    completedTotal: ot.totalCompleted,
    completedFromTotal: 0,
    completedFromRJO: ot.totalRjo,
    rjo: ot.totalRjo,
    carryOver: ot.lastCarryOver,
    mtd: ot.lastMtd,
    target: ot.target,
    pct: ot.lastPct,
    toGo: Math.max(0, ot.target - ot.lastMtd),
    variance: ot.lastMtd - ot.target,
    raw: ot,
  }
}

// ==================== RAW DATA (DAILY) PARSING ====================

/**
 * Parse RAW DATA CSV into date-keyed blocks.
 * RAW DATA format (old block format):
 *   "SLI DAILY TRACKING REPORT as of __Aug. 1, 2026__"  ← title row
 *   FIBERX                                                 ← sub-header
 *   AREA, BF, INC, TOTAL, COMPLETED, ..., RJO, CARRY OVER, MTD, TARGET, %
 *   ,,,,FROM TOTAL,FROM RJO,TOTAL,,,,,,,
 *   Benguet,38,34,72,19,15,34,20,33,34,509,6.68%,,      ← data rows
 *   OVER ALL TOTAL,...
 *
 * OR new continuous format:
 *   Date, AREA, BF, INC, Total Jo, COMPLETED FROM TOTAL, COMPLETED FROM RJO, TOTAL COMPLETED, RJO, Carry Over, MTD, TARGET, %
 *   Aug 1 2026, Benguet, 38, ...
 */
export function parseRawDailyData(rawRows) {
  if (!rawRows || rawRows.length === 0) return { dates: [], blocks: {} }

  const blocks = {}
  const dates = []

  // Check if this is the new continuous format (has 'Date' column)
  const hasDateCol = rawRows[0] && rawRows[0]['Date'] !== undefined

  if (hasDateCol) {
    // New continuous format — each row has a Date column
    for (const row of rawRows) {
      const dateStr = String(row['Date'] || '').trim()
      if (!dateStr) continue

      const area = String(row['AREA'] || '').trim()
      if (!area || area === 'AREA') continue

      if (!blocks[dateStr]) {
        blocks[dateStr] = { areas: [], overallTotal: null }
        dates.push(dateStr)
      }

      const entry = {
        area,
        bf: cleanNumber(row['BF']),
        inc: cleanNumber(row['INC']),
        totalJo: cleanNumber(row['Total Jo'] || row['TOTAL']),
        completedFromTotal: cleanNumber(row['COMPLETED FROM TOTAL']),
        completedFromRjo: cleanNumber(row['COMPLETED FROM RJO']),
        totalCompleted: cleanNumber(row['TOTAL COMPLETED']),
        rjo: cleanNumber(row['RJO']),
        carryOver: cleanNumber(row['Carry Over'] || row['CARRY OVER']),
        mtd: cleanNumber(row['MTD']),
        target: cleanNumber(row['TARGET']),
        pct: cleanNumber(row['%']),
      }

      if (area === 'OVER ALL TOTAL') {
        blocks[dateStr].overallTotal = entry
      } else {
        blocks[dateStr].areas.push(entry)
      }
    }
  } else {
    // Old block format — date in title rows
    let currentDate = null

    for (const row of rawRows) {
      const first = String(row['CLUSTER'] || row[Object.keys(row)[0]] || '').trim()

      // Detect title row
      if (first.includes('SLI DAILY TRACKING REPORT as of')) {
        let dateMatch = first.match(/__(.+?)__/)
        if (!dateMatch) dateMatch = first.match(/as of\s+(.+?)$/)
        if (dateMatch) {
          const d = dateMatch[1].trim().replace(/\./g, '').replace(/,/g, '').replace(/__/g, '').trim()
          currentDate = d
          if (!blocks[currentDate]) {
            blocks[currentDate] = { areas: [], overallTotal: null }
            dates.push(currentDate)
          }
        }
        continue
      }

      // Skip sub-headers
      if (first === 'FIBERX' || first === '' || first === 'AREA' || first.includes('FROM TOTAL') || first === 'BF') continue
      if (!currentDate) continue

      // Data row — extract AREA from first meaningful column
      const areaVal = String(row['AREA'] || '').trim() || first
      if (!areaVal || areaVal === 'AREA') continue

      const entry = {
        area: areaVal,
        bf: cleanNumber(row['BF']),
        inc: cleanNumber(row['INC']),
        totalJo: cleanNumber(row['TOTAL'] || row['Total Jo']),
        completedFromTotal: cleanNumber(row['FROM TOTAL'] || row['COMPLETED FROM TOTAL']),
        completedFromRjo: cleanNumber(row['FROM RJO'] || row['COMPLETED FROM RJO']),
        totalCompleted: cleanNumber(row['TOTAL'] || row['COMPLETED'] || row['TOTAL COMPLETED']),
        rjo: cleanNumber(row['RJO']),
        carryOver: cleanNumber(row['CARRY OVER'] || row['Carry Over']),
        mtd: cleanNumber(row['MTD']),
        target: cleanNumber(row['TARGET']),
        pct: cleanNumber(row['%']),
      }

      if (areaVal === 'OVER ALL TOTAL') {
        blocks[currentDate].overallTotal = entry
      } else if (AREAS.some(a => areaVal.includes(a))) {
        blocks[currentDate].areas.push(entry)
      }
    }
  }

  return { dates, blocks }
}

/**
 * Get today's date string in "Aug 30 2026" format for matching RAW DATA dates.
 */
export function getTodayStr() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const now = new Date()
  return `${months[now.getMonth()]} ${now.getDate()} ${now.getFullYear()}`
}

/**
 * Find the closest available date to today (or today itself).
 */
export function findClosestDate(dates, targetDateStr) {
  if (!dates || dates.length === 0) return null
  if (dates.includes(targetDateStr)) return targetDateStr

  // Try to parse and find closest
  const parseShort = (s) => {
    const m = s.match(/(\w+)\s+(\d+)\s+(\d{4})/)
    if (!m) return null
    const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }
    return new Date(parseInt(m[3]), months[m[1]], parseInt(m[2]))
  }

  const target = parseShort(targetDateStr)
  if (!target) return dates[dates.length - 1] // fallback to latest

  let closest = dates[0]
  let minDiff = Infinity

  for (const d of dates) {
    const dt = parseShort(d)
    if (!dt) continue
    const diff = Math.abs(dt.getTime() - target.getTime())
    if (diff < minDiff) {
      minDiff = diff
      closest = d
    }
  }

  return closest
}
