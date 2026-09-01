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

/** Convert value to number, returning 0 for empty/NaN (used for RAW DATA numeric fields) */
function toNum(val) {
  const n = cleanNumber(val)
  return isNaN(n) ? 0 : n
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
 * Parse a month-year header string like "August 2026" → "August 2026" or null.
 */
function parseMonthYearHeader(text) {
  if (!text) return null
  const trimmed = text.trim()
  for (const month of MONTH_NAMES) {
    const regex = new RegExp(`^${month}\\s+(\\d{4})$`, 'i')
    const m = trimmed.match(regex)
    if (m) return `${month} ${m[1]}`
  }
  return null
}

/**
 * Build a structured entry from MTD row using raw array positional indexing.
 * MTD columns: AREA(0) COMP_FROM_TOTAL(1) COMP_FROM_RJO(2) TOTAL_COMP(3) TOTAL_RJO(4) LAST_MTD(5) TARGET(6) LAST_PCT(7)
 */
function buildMTDEntry(area, rawArr) {
  return {
    area,
    compFromTotal: cleanNumber(rawArr[1]),
    compFromRjo: cleanNumber(rawArr[2]),
    totalCompleted: cleanNumber(rawArr[3]),
    totalRjo: cleanNumber(rawArr[4]),
    lastMtd: cleanNumber(rawArr[5]),
    target: cleanNumber(rawArr[6]),
    lastPct: cleanNumber(rawArr[7]),
  }
}

/**
 * Parse ALL month sections from the MTD sheet.
 * Returns { months: string[], sections: { [monthYear]: { areas, overallTotal } } }
 * Uses rawArr positional indexing to bypass CSV header mapping issues.
 */
function parseAllMonthSections(mtdData) {
  const rawArrays = mtdData.allRows || mtdData.rows || []
  const sections = {}
  const months = []
  let currentMonth = null
  let currentAreas = []
  let currentOverall = null

  for (let i = 0; i < rawArrays.length; i++) {
    const arr = rawArrays[i]
    const first = String(arr[0] || '').trim()

    if (first === 'AREA' || first === '') continue

    const monthYear = parseMonthYearHeader(first)
    if (monthYear) {
      // Save previous month section
      if (currentMonth) {
        sections[currentMonth] = { areas: currentAreas, overallTotal: currentOverall }
        months.push(currentMonth)
      }
      currentMonth = monthYear
      currentAreas = []
      currentOverall = null
      continue
    }

    if (first.includes('SLI MTD')) continue
    if (!currentMonth) continue

    const entry = buildMTDEntry(first, arr)

    if (first === 'OVER ALL TOTAL') {
      currentOverall = entry
    } else {
      currentAreas.push(entry)
    }
  }

  // Save last section
  if (currentMonth) {
    sections[currentMonth] = { areas: currentAreas, overallTotal: currentOverall }
    months.push(currentMonth)
  }

  return { months, sections }
}

/**
 * Parse MTD sheet CSV into structured data for Executive Overview.
 * @param {Object} mtdData - { headers, rows, objects } from parseCSV
 * @param {string} selectedMonthYear - e.g. "August 2026" (optional, defaults to current month)
 * @returns {{ areas, overallTotal, availableMonths, selectedMonthYear }} | null
 */
export function parseMTDData(mtdData, selectedMonthYear) {
  if (!mtdData) return null
  if (!mtdData.rows || mtdData.rows.length === 0) return null

  const currentMonthYear = getCurrentMonthYear()
  const targetMonth = selectedMonthYear || currentMonthYear

  const { months, sections } = parseAllMonthSections(mtdData)

  if (months.length === 0) return null

  // Return data for the target month, or fall back to current, or last available
  const data = sections[targetMonth] || sections[currentMonthYear] || sections[months[months.length - 1]]
  if (!data) return null

  return {
    ...data,
    availableMonths: months,
    selectedMonthYear: sections[targetMonth] ? targetMonth : (sections[currentMonthYear] ? currentMonthYear : months[months.length - 1]),
  }
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
        rjoIncoming: dailyBlock.overallTotal.rjoIncoming || 0,
        rjoRedispatched: dailyBlock.overallTotal.rjoRedispatched || 0,
        totalRjo: dailyBlock.overallTotal.totalRjo || 0,
        totalCompleted: dailyBlock.overallTotal.totalCompleted || 0,
        carryOver: dailyBlock.overallTotal.carryOver || 0,
      }
    : null

  return { mtd, daily, raw: ot }
}

// ==================== RAW DATA (DAILY) PARSING ====================

// Areas are now dynamically detected from RAW DATA — no hardcoded list needed

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

      // RAW DATA v8 columns:
      // Date(0) AREA(1) BF(2) INC(3) TotalJo(4) CompFromTotal(5) CompFromRjo(6) TotalCompleted(7)
      // RjoIncoming(8) RjoRedispatched(9) TotalRjo(10) CarryOver(11) MTD(12) TARGET(13) %(14)
      const entry = {
        area,
        bf: toNum(arr[2]),
        inc: toNum(arr[3]),
        totalJo: toNum(arr[4]),
        completedFromTotal: toNum(arr[5]),
        completedFromRjo: toNum(arr[6]),
        totalCompleted: toNum(arr[7]),
        rjoIncoming: toNum(arr[8]),
        rjoRedispatched: toNum(arr[9]),
        totalRjo: toNum(arr[10]),
        carryOver: toNum(arr[11]),
        mtd: toNum(arr[12]),
        target: toNum(arr[13]),
        pct: toNum(arr[14]),
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

      // Old block format columns (same as new RAW DATA):
      // AREA(0) BF(1) INC(2) TotalJo(3) CompFromTotal(4) CompFromRjo(5) TotalCompleted(6)
      // RjoIncoming(7) RjoRedispatched(8) TotalRjo(9) CarryOver(10) MTD(11) TARGET(12) %(13)
      const entry = {
        area: areaVal,
        bf: toNum(arr[1]),
        inc: toNum(arr[2]),
        totalJo: toNum(arr[3]),
        completedFromTotal: toNum(arr[4]),
        completedFromRjo: toNum(arr[5]),
        totalCompleted: toNum(arr[6]),
        rjoIncoming: toNum(arr[7]),
        rjoRedispatched: toNum(arr[8]),
        totalRjo: toNum(arr[9]),
        carryOver: toNum(arr[10]),
        mtd: toNum(arr[11]),
        target: toNum(arr[12]),
        pct: toNum(arr[13]),
      }

      if (areaVal === 'OVER ALL TOTAL') {
        blocks[currentDate].overallTotal = entry
      } else if (areaVal && areaVal !== 'AREA') {
        // Accept any area name dynamically — no hardcoded filtering
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
