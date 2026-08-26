/**
 * Process raw CSV rows into grouped structure by Cluster and Area.
 * The Google Sheet layout has cluster headers, area rows, subtotal rows,
 * and an overall total row at the bottom.
 */

// Columns as they appear in the sheet
export const COLUMNS = [
  { key: 'CLUSTER', label: 'CLUSTER', sticky: true },
  { key: 'AREA', label: 'AREA', sticky: true },
  { key: 'BF', label: 'BF', align: 'right' },
  { key: 'INC', label: 'INC', align: 'right' },
  { key: 'TOTAL', label: 'TOTAL', align: 'right', bold: true },
  { key: 'COMPLETED FROM TOTAL', label: 'CMP-TOT', align: 'right' },
  { key: 'COMPLETED FROM RJO', label: 'CMP-RJO', align: 'right' },
  { key: 'COMPLETED TOTAL', label: 'CMP', align: 'right', bold: true },
  { key: 'RJO', label: 'RJO', align: 'right' },
  { key: 'CARRY OVER', label: 'CO', align: 'right' },
  { key: 'MTD', label: 'MTD', align: 'right', bold: true },
  { key: 'TARGET', label: 'TARGET', align: 'right' },
  { key: '%', label: '%', align: 'center', highlight: true },
  { key: 'VARIANCE', label: 'VARI', align: 'right' },
  { key: 'TO GO', label: 'TO GO', align: 'right', prominent: true },
]

/**
 * Clean numeric string — strip commas, spaces, % signs, parens for negatives
 */
function cleanNumber(val) {
  if (!val || typeof val !== 'string') return NaN
  let s = val.replace(/[,\s]/g, '')
  // Handle parenthesized negatives: (123) → -123
  const neg = s.startsWith('(') && s.endsWith(')')
  if (neg) s = s.slice(1, -1)
  if (s.endsWith('%')) s = s.slice(0, -1)
  const n = parseFloat(s)
  if (isNaN(n)) return NaN
  return neg ? -n : n
}

/**
 * Format number for display
 */
export function formatNumber(val, colKey) {
  if (val === null || val === undefined || val === '') return '—'
  if (colKey === '%') {
    const n = cleanNumber(String(val))
    if (isNaN(n)) return val
    return n.toFixed(1) + '%'
  }
  const n = cleanNumber(String(val))
  if (isNaN(n)) return val
  if (Math.abs(n) >= 1000) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }
  return n % 1 !== 0 ? n.toFixed(1) : String(n)
}

/**
 * Get the numeric value for a cell (for comparison logic)
 */
function getNum(row, colKey) {
  return cleanNumber(row[colKey])
}

/**
 * Process rows: classify each as cluster-header, area-data, cluster-subtotal, or overall-total
 */
export function processRows(rawData) {
  if (!rawData || rawData.length === 0) return []

  const rows = []
  let currentCluster = ''

  for (const row of rawData) {
    const cluster = (row['CLUSTER'] || '').trim()
    const area = (row['AREA'] || '').trim()
    const total = row['TOTAL']

    // Skip completely empty rows
    if (!cluster && !area && !total) continue

    // Check if this is an overall TOTAL row
    if (/^GRAND\s*TOTAL$/i.test(cluster) || /^GRAND\s*TOTAL$/i.test(area)) {
      rows.push({ type: 'overall-total', row, cluster: 'OVERALL TOTAL' })
      continue
    }

    // Check if this is a cluster subtotal row (area says "TOTAL" and no cluster name)
    if (/^TOTAL$/i.test(area) && !cluster) {
      rows.push({ type: 'cluster-subtotal', row, cluster: currentCluster })
      continue
    }

    // Check if this is a cluster header (has a cluster name like "CLUSTER 1", "CLUSTER 2", etc.)
    const clusterMatch = cluster.match(/CLUSTER\s*(\d+)/i)
    if (clusterMatch) {
      currentCluster = `CLUSTER ${clusterMatch[1]}`
      // If the row also has data (not just a header), it might be both
      if (area && area !== cluster) {
        rows.push({ type: 'area', row, cluster: currentCluster, area })
      } else if (!total && area) {
        // Pure cluster header
        rows.push({ type: 'cluster-header', row, cluster: currentCluster })
        continue
      } else {
        // Could be cluster header with some data
        rows.push({ type: 'cluster-header', row, cluster: currentCluster })
        continue
      }
    }

    // It's an area row
    if (area && cluster) {
      currentCluster = cluster
    }
    if (!currentCluster && cluster) {
      currentCluster = cluster
    }

    if (area) {
      rows.push({ type: 'area', row, cluster: currentCluster, area })
    } else if (cluster) {
      currentCluster = cluster
      rows.push({ type: 'cluster-header', row, cluster: currentCluster })
    }
  }

  return rows
}

/**
 * Get achievement badge styling for a % value
 */
export function getBadgeStyle(pctValue) {
  const n = cleanNumber(String(pctValue))
  if (isNaN(n)) return { color: 'text-slate-400 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800', label: '—' }
  if (n >= 100) return { color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/60', border: 'border-emerald-400 dark:border-emerald-500/40', label: 'HIT', pulse: true }
  if (n >= 80) return { color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/60', border: 'border-amber-400 dark:border-amber-500/40', label: 'LAG' }
  return { color: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/60', border: 'border-red-400 dark:border-red-500/40', label: 'MISS' }
}
