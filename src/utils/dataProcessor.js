/**
 * Process raw CSV rows into grouped structure by Cluster and Area.
 * The Google Sheet layout has:
 *   - Area rows with a numeric CLUSTER value (1, 2, 3, 4)
 *   - Cluster subtotal rows (blank CLUSTER & AREA, but has VARIANCE/TO GO data)
 *   - Overall total row ("OVER ALL TOTAL" in AREA column)
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
 * Process rows: classify each as cluster-header, area-data, cluster-subtotal, or overall-total.
 * Auto-generates cluster-header rows when a new cluster number is encountered.
 */
export function processRows(rawData) {
  if (!rawData || rawData.length === 0) return []

  const rows = []
  let currentCluster = ''

  // Helper: check if a row has any numeric data in key columns
  function hasNumericData(r) {
    return r['MTD'] || r['TARGET'] || r['TOTAL'] || r['VARIANCE'] || r['TO GO'] || r['BF']
  }

  for (const row of rawData) {
    const cluster = (row['CLUSTER'] || '').trim()
    const area = (row['AREA'] || '').trim()

    // Skip header row
    if (cluster === 'CLUSTER' || area === 'AREA') continue

    // Check if this is an overall TOTAL row
    const isTotalLabel = /grand\s*total|over\s*all\s*total|overall\s*total/i
    if (isTotalLabel.test(cluster) || isTotalLabel.test(area)) {
      rows.push({ type: 'overall-total', row, cluster: 'OVER ALL TOTAL' })
      continue
    }

    // Detect numeric cluster value (1, 2, 3, 4)
    const clusterNum = cluster.match(/^\d+$/) ? cluster : null

    if (clusterNum) {
      // If this is a new cluster, auto-insert a cluster-header row first
      if (clusterNum !== currentCluster) {
        currentCluster = clusterNum
        rows.push({ type: 'cluster-header', row: {}, cluster: currentCluster })
      }
      if (area) {
        rows.push({ type: 'area', row, cluster: currentCluster, area })
      } else if (hasNumericData(row)) {
        rows.push({ type: 'cluster-header', row, cluster: currentCluster })
      }
      continue
    }

    // Blank CLUSTER but has data — cluster subtotal
    if (!cluster && !area && hasNumericData(row)) {
      rows.push({ type: 'cluster-subtotal', row, cluster: currentCluster })
      continue
    }

    // Area row without explicit cluster number (inherits current cluster)
    if (area) {
      rows.push({ type: 'area', row, cluster: currentCluster, area })
    }
  }

  return rows
}

/**
 * Extract overall total metrics from processed rows for the Executive Overview
 */
export function extractOverallMetrics(processedRows) {
  const overall = processedRows.find(r => r.type === 'overall-total')
  if (!overall) return null

  const r = overall.row
  const pctVal = cleanNumber(String(r['%']))
  const completedFromTotal = cleanNumber(String(r['COMPLETED FROM TOTAL']))
  const completedFromRJO = cleanNumber(String(r['COMPLETED FROM RJO']))
  const completedTotal = cleanNumber(String(r['COMPLETED TOTAL']))

  return {
    // Workload
    bf: cleanNumber(String(r['BF'])),
    inc: cleanNumber(String(r['INC'])),
    total: cleanNumber(String(r['TOTAL'])),
    // Output
    completedFromTotal,
    completedFromRJO,
    completedTotal: isNaN(completedTotal)
      ? (isNaN(completedFromTotal) ? 0 : completedFromTotal) + (isNaN(completedFromRJO) ? 0 : completedFromRJO)
      : completedTotal,
    rjo: cleanNumber(String(r['RJO'])),
    carryOver: cleanNumber(String(r['CARRY OVER'])),
    // Monthly progress
    mtd: cleanNumber(String(r['MTD'])),
    target: cleanNumber(String(r['TARGET'])),
    pct: isNaN(pctVal) ? null : pctVal,
    variance: cleanNumber(String(r['VARIANCE'])),
    toGo: cleanNumber(String(r['TO GO'])),
    // Raw for display
    raw: r,
  }
}

/**
 * Build flat table rows with rowspan info for cluster grouping.
 * Returns an array of row objects, each with a `rowspan` on the CLUSTER cell
 * and a `type` field for rendering logic.
 */
export function buildTableRows(rawData) {
  const processed = processRows(rawData)
  if (processed.length === 0) return []

  // Group consecutive area + subtotal rows by cluster
  const groups = []
  let currentGroup = null

  for (const entry of processed) {
    if (entry.type === 'cluster-header') {
      // Start a new group
      currentGroup = { cluster: entry.cluster, areas: [], subtotal: null }
      groups.push(currentGroup)
    } else if (entry.type === 'area' && currentGroup) {
      currentGroup.areas.push(entry)
    } else if (entry.type === 'cluster-subtotal' && currentGroup) {
      currentGroup.subtotal = entry
    } else if (entry.type === 'overall-total') {
      groups.push({ type: 'overall-total', entry })
    }
  }

  // Build flat rows for rendering
  const tableRows = []
  for (const group of groups) {
    if (group.type === 'overall-total') {
      tableRows.push({ ...group.entry, rowspan: 1, isFirstOfCluster: false })
      continue
    }

    const clusterRows = group.areas.length + (group.subtotal ? 1 : 0)
    if (clusterRows === 0) continue

    group.areas.forEach((area, idx) => {
      tableRows.push({
        ...area,
        rowspan: idx === 0 ? clusterRows : 0,
        isFirstOfCluster: idx === 0,
      })
    })

    if (group.subtotal) {
      tableRows.push({
        ...group.subtotal,
        rowspan: 0,
        isFirstOfCluster: false,
      })
    }
  }

  return tableRows
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
