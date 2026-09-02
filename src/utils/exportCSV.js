/**
 * Export RAW DATA as a downloadable CSV file.
 * Reconstructs CSV from the parsed blocks data in memory.
 */

const HEADERS = [
  'Date', 'AREA', 'BF', 'INC', 'Total Jo',
  'COMPLETED FROM TOTAL', 'COMPLETED FROM RJO', 'TOTAL COMPLETED',
  'RJO INCOMING', 'RJO REDISPATCHED', 'TOTAL RJO',
  'Carry Over', 'MTD', 'TARGET', '%'
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
export function exportRawDataCSV(rawDaily) {
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
  link.download = `SLI_RAW_DATA_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
