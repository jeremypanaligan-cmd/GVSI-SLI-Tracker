/**
 * Parse a CSV string into an array of objects.
 * Handles quoted fields and various line endings.
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

  const headers = parseRow(lines[0])
  const data = []

  for (let i = 1; i < lines.length; i++) {
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
