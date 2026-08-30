/**
 * Parse a CSV string into an array of objects.
 * Handles quoted fields, various line endings, and title/header rows.
 */
export function parseCSV(csvText) {
  const lines = []
  let current = ''
  let inQuotes = false

  // Normalize line endings and split
  const normalized = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]

    if (char === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        current += '"'
        i++ // skip escaped quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === '\n' && !inQuotes) {
      lines.push(current)
      current = ''
    } else {
      current += char
    }
  }
  if (current) lines.push(current)

  if (lines.length === 0) return []

  const parseRow = (line) => {
    const cells = []
    let cell = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQ = !inQ
        }
      } else if (c === ',' && !inQ) {
        cells.push(cell.trim())
        cell = ''
      } else {
        cell += c
      }
    }
    cells.push(cell.trim())
    return cells
  }

  // Find the header row: first line with at least 3 non-empty cells
  // (skips title rows like "SLI MTD TRACKING REPORT,,,,,,,,")
  let headerIndex = 0
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cells = parseRow(lines[i])
    const nonEmpty = cells.filter(c => c !== '')
    if (nonEmpty.length >= 3) {
      headerIndex = i
      break
    }
  }

  const headers = parseRow(lines[headerIndex])
  const data = []

  for (let i = headerIndex + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const values = parseRow(lines[i])
    const row = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx] : ''
    })
    data.push(row)
  }

  return data
}
