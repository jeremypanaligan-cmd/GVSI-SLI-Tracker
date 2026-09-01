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
 * Build a column index map from a header row array.
 * Returns { colName: index } for mapping data rows.
 */
function buildColumnMap(headerArr) {
  const map = {}
  headerArr.forEach((h, idx) => {
    const key = String(h || '').trim().toUpperCase()
    if (key) map[key] = idx
  })
  return map
}

/**
 * Build a structured entry from MTD row using a column map.
 * Dynamically finds column indices by header name.
 */
function buildMTDEntry(area, rawArr, colMap) {
  const col = (name) => {
    const idx = colMap[name]
    return idx !== undefined ? idx : -1
  }
  const val = (name) => {
    const idx = col(name)
    return idx >= 0 && idx < rawArr.length ? cleanNumber(rawArr[idx]) : NaN
  }
  return {
    area,
    compFromTotal: val('COMPLETED FROM TOTAL'),
    compFromRjo: val('COMPLETED FROM RJO'),
    totalCompleted: val('TOTAL COMPLETED'),
    thisMoRjo: val('THIS MO. RJO'),
    prevMosRjo: val('PREV MOS. RJO'),
    totalRjo: val('TOTAL RJO'),
    lastMtd: val('LAST MTD'),
    target: val('TARGET'),
    lastPct: val('LAST %'),
    totalIncoming: val('TOTAL INCOMING'),
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
  let currentColMap = null

  for (let i = 0; i < rawArrays.length; i++) {
    const arr = rawArrays[i]
    const first = String(arr[0] || '').trim()

    // Detect header row: starts with 'AREA' and has multiple non-empty cells
    if (first === 'AREA') {
      const nonEmpty = arr.filter(c => String(c || '').trim() !== '')
      if (nonEmpty.length >= 5) {
        currentColMap = buildColumnMap(arr)
        continue
      }
    }

    if (first === '') continue

    const monthYear = parseMonthYearHeader(first)
    if (monthYear) {
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
    if (!currentColMap) continue

    const entry = buildMTDEntry(first, arr, currentColMap)

    if (first === 'OVER ALL TOTAL') {
      currentOverall = entry
    } else {
      currentAreas.push(entry)
    }
  }

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
    pct: ot.lastPct,              // LAST % → Achievement Rate
    totalCompleted: ot.lastMtd,   // LAST MTD → Total Completed
    target: ot.target,            // TARGET → Monthly Target
    mtd: ot.lastMtd,              // LAST MTD
    toGo: Math.max(0, (ot.target || 0) - (ot.lastMtd || 0)),
    variance: (ot.lastMtd || 0) - (ot.target || 0),
    totalIncoming: ot.totalIncoming || 0,
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
        // Total Completed = COMPLETED FROM TOTAL (Col F) + COMPLETED FROM RJO (Col G)
        totalCompleted: (dailyBlock.overallTotal.completedFromTotal || 0) + (dailyBlock.overallTotal.completedFromRjo || 0),
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
 * Normalize date strings from RAW DATA to 'Month Day, Year' format.
 * Handles: 'Aug 1 2026', 'Aug. 1, 2026', 'September 1, 2026', etc.
 */
function normalizeRawDate(raw) {
  const s = raw.trim()
  // Already in full format
  if (/^\w+\s+\d+,\s*\d{4}$/.test(s)) return s
  // 'Aug 1 2026' or 'Aug. 1 2026' or 'Aug 1, 2026'
  const m = s.match(/^(\w+\.?)\s+(\d+),?\s*(\d{4})$/)
  if (!m) return s
  const monthAbbr = m[1].replace(/\.$/, '').toLowerCase()
  const day = parseInt(m[2])
  const year = m[3]
  const monthMap = {
    jan: 'January', feb: 'February', mar: 'March', apr: 'April',
    may: 'May', jun: 'June', jul: 'July', aug: 'August',
    sep: 'September', sept: 'September', oct: 'October',
    nov: 'November', dec: 'December'
  }
  const fullMonth = monthMap[monthAbbr]
  return fullMonth ? `${fullMonth} ${day}, ${year}` : s
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

      const rawDate = String(arr[0] || row['Date'] || '').trim()
      if (!rawDate) continue
      // Normalize date format: 'Aug 1 2026' → 'August 1, 2026'
      const dateStr = normalizeRawDate(rawDate)
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
      const compTotal = toNum(arr[5])
      const compRjo = toNum(arr[6])
      const entry = {
        area,
        bf: toNum(arr[2]),
        inc: toNum(arr[3]),
        totalJo: toNum(arr[4]),
        completedFromTotal: compTotal,
        completedFromRjo: compRjo,
        // Total Completed = COMPLETED FROM TOTAL + COMPLETED FROM RJO
        totalCompleted: compTotal + compRjo,
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
        // Total Completed = COMPLETED FROM TOTAL + COMPLETED FROM RJO
        totalCompleted: toNum(arr[4]) + toNum(arr[5]),
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
