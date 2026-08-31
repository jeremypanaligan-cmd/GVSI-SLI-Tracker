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

// ==================== MONTH DETECTION ====================

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Get current month and year as a string like "August 2026"
 */
export function getCurrentMonthYear() {
  const now = new Date()
  return `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`
}

// ==================== MTD PARSING ====================

/**
 * Parse MTD sheet CSV into structured data for Executive Overview.
 * @param {Object} mtdData - { headers, rows, objects } from parseCSV
 */
export function parseMTDData(mtdData) {
  if (!mtdData) return null
  const mtdRows = mtdData.objects || []
  if (mtdRows.length === 0) return null

  const currentMonthYear = getCurrentMonthYear()
  let foundCurrentMonth = false
  let areas = []
  let overallTotal = null

  for (const row of mtdRows) {
    const area = String(row['AREA'] || '').trim()

    if (area === 'AREA') continue

    // Detect month section headers
    const isMonthHeader = MONTH_NAMES.some(m => area.includes(m)) && /\d{4}/.test(area)
    if (isMonthHeader) {
      foundCurrentMonth = area === currentMonthYear
      if (!foundCurrentMonth && areas.length > 0) break
      areas = []
      overallTotal = null
      continue
    }

    if (!area || area.includes('SLI MTD')) continue
    if (!foundCurrentMonth) continue

    const entry = {
      area,
      compFromTotal: cleanNumber(row['COMPLETED FROM TOTAL']),
      compFromRjo: cleanNumber(row['COMPLETED FROM RJO']),
      totalCompleted: cleanNumber(row['TOTAL COMPLETED']),
      totalRjo: cleanNumber(row['TOTAL RJO']),
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

  // Fallback: if current month not found, use last complete section
  if (!overallTotal && areas.length === 0) {
    return parseMTDDataFallback(mtdRows)
  }

  return { areas, overallTotal }
}

function parseMTDDataFallback(mtdRows) {
  if (!mtdRows || mtdRows.length === 0) return null

  let areas = []
  let overallTotal = null
  let tempAreas = []

  for (const row of mtdRows) {
    const area = String(row['AREA'] || '').trim()
    if (area === 'AREA') continue

    const isMonthHeader = MONTH_NAMES.some(m => area.includes(m)) && /\d{4}/.test(area)
    if (isMonthHeader) {
      if (overallTotal) break
      tempAreas = []
      continue
    }

    if (!area || area.includes('SLI MTD')) continue

    const entry = {
      area,
      compFromTotal: cleanNumber(row['COMPLETED FROM TOTAL']),
      compFromRjo: cleanNumber(row['COMPLETED FROM RJO']),
      totalCompleted: cleanNumber(row['TOTAL COMPLETED']),
      totalRjo: cleanNumber(row['TOTAL RJO']),
      lastMtd: cleanNumber(row['LAST MTD']),
      target: cleanNumber(row['TARGET']),
      lastPct: cleanNumber(row['LAST %']),
    }

    if (area === 'OVER ALL TOTAL') {
      overallTotal = entry
      areas = [...tempAreas]
      tempAreas = []
    } else {
      tempAreas.push(entry)
    }
  }

  return { areas, overallTotal }
}

/**
 * Extract executive KPI metrics from parsed MTD data + daily block.
 */
export function extractExecutiveMetrics(mtdData, dailyBlock) {
  if (!mtdData || !mtdData.overallTotal) return null
  const ot = mtdData.overallTotal

  const mtd = {
    pct: ot.lastPct,
    totalCompleted: ot.totalCompleted,
    target: ot.target,
    mtd: ot.lastMtd,
    toGo: Math.max(0, (ot.target || 0) - (ot.lastMtd || 0)),
    variance: (ot.lastMtd || 0) - (ot.target || 0),
  }

  const daily = dailyBlock?.overallTotal
    ? {
        bf: dailyBlock.overallTotal.bf || 0,
        inc: dailyBlock.overallTotal.inc || 0,
        activeBacklog: dailyBlock.overallTotal.completedFromTotal || 0,
        completedFromRjo: dailyBlock.overallTotal.completedFromRjo || 0,
        rjo: dailyBlock.overallTotal.rjo || 0,
        totalCompleted: dailyBlock.overallTotal.totalCompleted || 0,
        carryOver: dailyBlock.overallTotal.carryOver || 0,
      }
    : null

  return { mtd, daily, raw: ot }
}

// ==================== RAW DATA (DAILY) PARSING ====================

const AREAS = [
  'Benguet', 'Ilocos Sur', 'Ilocos Norte', 'Nueva Vizcaya',
  'Isabela', 'Quirino', 'Cagayan', 'Kalinga', 'Abra',
  'Ifugao', 'Apayao', 'Mountain Province'
]

/**
 * Map a raw CSV row array to an entry object using column indices.
 * RAW DATA columns: AREA(0) BF(1) INC(2) TOTAL(3) COMP_FROM_TOTAL(4) COMP_FROM_RJO(5) TOTAL_COMP(6) RJO(7) CARRY_OVER(8) MTD(9) TARGET(10) %(11)
 */
function mapRowByIndex(vals) {
  return {
    bf: cleanNumber(vals[1]),
    inc: cleanNumber(vals[2]),
    totalJo: cleanNumber(vals[3]),
    completedFromTotal: cleanNumber(vals[4]),
    completedFromRjo: cleanNumber(vals[5]),
    totalCompleted: cleanNumber(vals[6]),
    rjo: cleanNumber(vals[7]),
    carryOver: cleanNumber(vals[8]),
    mtd: cleanNumber(vals[9]),
    target: cleanNumber(vals[10]),
    pct: cleanNumber(vals[11]),
  }
}

/**
 * Extract date from RAW DATA title row.
 */
function extractDateFromTitle(title) {
  let m = title.match(/__(\w+\.?\s*\d+),?\s*(\d{4})__/)
  if (m) return formatDisplayDate(m[1].trim(), m[2])

  m = title.match(/as of\s+__(\w+\.?\s*\d+),?\s*(\d{4})__/)
  if (m) return formatDisplayDate(m[1].trim(), m[2])

  m = title.match(/(\w+\.?\s*\d+),?\s*(\d{4})/)
  if (m) return formatDisplayDate(m[1].trim(), m[2])

  return null
}

/**
 * Format "Aug.1" + "2026" → "August 1, 2026"
 */
function formatDisplayDate(monthDay, year) {
  // Parse 'Aug.1' or 'Aug 1' or 'Sept. 01' → month + day
  const m = monthDay.match(/(\w+)[.\s]+(\d+)/)
  if (!m) return monthDay + ', ' + year

  const rawAbbr = m[1].toLowerCase()
  const day = parseInt(m[2])

  // Match abbreviated or full month names
  const monthMap = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5,
    jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
  }

  const monthIdx = monthMap[rawAbbr]
  if (monthIdx === undefined) return monthDay + ', ' + year

  return `${MONTH_NAMES[monthIdx]} ${day}, ${year}`
}

/**
 * Parse RAW DATA CSV into date-keyed blocks.
 * @param {Object} rawData - { headers, rows, objects } from parseCSV
 */
export function parseRawDailyData(rawData) {
  if (!rawData) return { dates: [], blocks: {} }
  const rawObjects = rawData.objects || []
  const rawArrays = rawData.rows || []
  if (rawObjects.length === 0) return { dates: [], blocks: {} }

  const blocks = {}
  const dates = []

  // Check for new continuous format (has 'Date' column in headers)
  const hasDateCol = rawData.headers && rawData.headers[0] === 'Date'

  if (hasDateCol) {
    // New continuous format — each row has a Date column
    for (let i = 0; i < rawObjects.length; i++) {
      const row = rawObjects[i]
      const arr = rawArrays[i] || []

      const dateStr = String(arr[0] || row['Date'] || '').trim()
      if (!dateStr) continue

      const area = String(arr[1] || row['AREA'] || '').trim()
      if (!area || area === 'AREA') continue

      if (!blocks[dateStr]) {
        blocks[dateStr] = { areas: [], overallTotal: null }
        dates.push(dateStr)
      }

      // For continuous format, offset by 1 (Date is col 0)
      const entry = {
        area,
        bf: cleanNumber(arr[2]),
        inc: cleanNumber(arr[3]),
        totalJo: cleanNumber(arr[4]),
        completedFromTotal: cleanNumber(arr[5]),
        completedFromRjo: cleanNumber(arr[6]),
        totalCompleted: cleanNumber(arr[7]),
        rjo: cleanNumber(arr[8]),
        carryOver: cleanNumber(arr[9]),
        mtd: cleanNumber(arr[10]),
        target: cleanNumber(arr[11]),
        pct: cleanNumber(arr[12]),
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

    for (let i = 0; i < rawArrays.length; i++) {
      const arr = rawArrays[i]
      const first = String(arr[0] || '').trim()

      // Detect title rows
      if (first.includes('SLI DAILY TRACKING REPORT')) {
        const parsed = extractDateFromTitle(first)
        if (parsed) {
          currentDate = parsed
          if (!blocks[currentDate]) {
            blocks[currentDate] = { areas: [], overallTotal: null }
            dates.push(currentDate)
          }
        }
        continue
      }

      // Skip non-data rows
      if (first === 'FIBERX' || first === '' || first === 'AREA' ||
          first === 'BF' || first.includes('FROM TOTAL') || first.includes('FROM RJO')) {
        continue
      }
      if (!currentDate) continue

      // Use column-index based mapping (reliable!)
      const areaVal = first
      if (!areaVal || areaVal === 'AREA') continue

      const entry = {
        area: areaVal,
        ...mapRowByIndex(arr),
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

// ==================== DATE UTILITIES ====================

/**
 * Get today's date string in "August 31, 2026" format
 */
export function getTodayStr() {
  const now = new Date()
  return `${MONTH_NAMES[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`
}

/**
 * Parse a display date like "August 31, 2026" into a Date object
 */
function parseDisplayDate(s) {
  const m = s.match(/(\w+)\s+(\d+),?\s*(\d{4})/)
  if (!m) return null
  const monthIdx = MONTH_NAMES.findIndex(n => n.toLowerCase() === m[1].toLowerCase())
  if (monthIdx === -1) return null
  return new Date(parseInt(m[3]), monthIdx, parseInt(m[2]))
}

/**
 * Find the closest available date to the target
 */
export function findClosestDate(dates, targetDateStr) {
  if (!dates || dates.length === 0) return null
  if (dates.includes(targetDateStr)) return targetDateStr

  const target = parseDisplayDate(targetDateStr)
  if (!target) return dates[dates.length - 1]

  let closest = dates[0]
  let minDiff = Infinity

  for (const d of dates) {
    const dt = parseDisplayDate(d)
    if (!dt) continue
    const diff = Math.abs(dt.getTime() - target.getTime())
    if (diff < minDiff) {
      minDiff = diff
      closest = d
    }
  }

  return closest
}
