/**
 * Parse a CSV string into an array of row arrays (then map to objects).
 * Returns { headers, rows } where rows are arrays of strings.
 * Also returns objects[] for convenience.
 *
 * Single-pass parser: handles quoted fields, commas inside quotes,
 * escaped quotes, and line endings all in one pass.
 */
export function parseCSV(csvText) {
  if (!csvText || !csvText.trim()) return { headers: [], rows: [], objects: [] }

  const normalized = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const allRows = []
  let currentRow = []
  let currentCell = ''
  let inQuotes = false

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]

    if (char === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        currentCell += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim())
      currentCell = ''
    } else if (char === '\n' && !inQuotes) {
      currentRow.push(currentCell.trim())
      currentCell = ''
      if (currentRow.length > 0) {
        allRows.push(currentRow)
      }
      currentRow = []
    } else {
      currentCell += char
    }
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell.trim())
    allRows.push(currentRow)
  }

  if (allRows.length === 0) return { headers: [], rows: [], objects: [], allRows: [] }

  // Find header row: first row with ≥5 non-empty cells
  let headerIndex = 0
  for (let i = 0; i < allRows.length; i++) {
    const nonEmpty = allRows[i].filter(c => c !== '')
    if (nonEmpty.length >= 5) {
      headerIndex = i
      break
    }
  }

  const headers = allRows[headerIndex]
  const rows = [] // raw row arrays
  const objects = [] // header-mapped objects

  for (let i = headerIndex + 1; i < allRows.length; i++) {
    const rv = allRows[i]
    if (rv.every(c => c === '')) continue

    rows.push(rv)

    const obj = {}
    headers.forEach((h, idx) => {
      obj[h] = idx < rv.length ? rv[idx] : ''
    })
    objects.push(obj)
  }

  return { headers, rows, objects, allRows }
}
