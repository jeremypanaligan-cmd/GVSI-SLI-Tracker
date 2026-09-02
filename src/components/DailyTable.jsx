/**
 * DailyTable — Displays RAW DATA for a specific date.
 * Shows area rows + OVER ALL TOTAL with achievement badges.
 * Columns are sortable by clicking header.
 * 
 * RAW DATA v8 columns:
 *   Date | AREA | BF | INC | Total Jo | COMPLETED FROM TOTAL | COMPLETED FROM RJO | TOTAL COMPLETED
 *   | RJO INCOMING | RJO RD | TOTAL RJO | Carry Over | MTD | TARGET | %
 */
import { useState, useMemo } from 'react'
import { formatNumber, getBadgeStyle } from '../utils/dataProcessor'

const COLUMNS = [
  { key: 'area', label: 'AREA', sticky: true, sortable: true },
  { key: 'bf', label: 'BF', align: 'right', sortable: true },
  { key: 'inc', label: 'INC', align: 'right', sortable: true },
  { key: 'totalJo', label: 'TOTAL JO', align: 'right', bold: true, sortable: true },
  { key: 'completedFromTotal', label: 'COMP FROM TOTAL', align: 'right', sortable: true },
  { key: 'completedFromRjo', label: 'COMP FROM RJO', align: 'right', sortable: true },
  { key: 'totalCompleted', label: 'TOTAL COMP', align: 'right', bold: true, sortable: true },
  { key: 'rjoIncoming', label: 'RJO INCOMING', align: 'right', sortable: true },
  { key: 'rjoRedispatched', label: 'RJO RD', align: 'right', sortable: true },
  { key: 'totalRjo', label: 'TOTAL RJO', align: 'right', bold: true, sortable: true },
  { key: 'carryOver', label: 'CARRY OVER', align: 'right', sortable: true },
  { key: 'mtd', label: 'MTD', align: 'right', bold: true, sortable: true },
  { key: 'target', label: 'TARGET', align: 'right', sortable: true },
  { key: 'pct', label: '%', align: 'center', highlight: true, sortable: true },
]

function Td({ children, align = 'left', bold = false, highlight = false, className = '', sticky = false, bgColor = '' }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''
  return (
    <td className={`px-3 py-2.5 text-sm whitespace-nowrap ${alignClass} ${bold ? 'font-bold' : 'font-medium'} ${className} ${sticky ? 'sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700/40' : ''} ${bgColor}`}
      style={sticky ? { minWidth: '140px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' } : undefined}
    >
      {children}
    </td>
  )
}

function PctBadge({ value }) {
  const badge = getBadgeStyle(value)
  const display = formatNumber(value, '%')
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.bg} ${badge.color} ${badge.border}`}>
      {badge.pulse && <span className={`w-1.5 h-1.5 rounded-full mr-1 ${badge.color.includes('emerald') ? 'bg-emerald-500' : badge.color.includes('amber') ? 'bg-amber-500' : 'bg-red-500'} animate-pulse`} />}
      {display}
    </span>
  )
}

function SortIcon({ active, direction }) {
  if (!active) {
    return (
      <svg className="w-3 h-3 ml-1 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    )
  }
  return (
    <svg className={`w-3 h-3 ml-1 text-teal-500 dark:text-teal-400 transition-transform ${direction === 'desc' ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  )
}

export default function DailyTable({ dateData }) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedAreas = useMemo(() => {
    if (!dateData?.areas) return []
    if (!sortKey) return dateData.areas

    return [...dateData.areas].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      if (sortKey === 'area') {
        const cmp = String(aVal || '').localeCompare(String(bVal || ''))
        return sortDir === 'asc' ? cmp : -cmp
      }
      const numA = typeof aVal === 'number' ? aVal : 0
      const numB = typeof bVal === 'number' ? bVal : 0
      return sortDir === 'asc' ? numA - numB : numB - numA
    })
  }, [dateData, sortKey, sortDir])

  if (!dateData || (!dateData.areas?.length && !dateData.overallTotal)) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400 dark:text-slate-600">
        <p className="text-sm">No data available for this date.</p>
      </div>
    )
  }

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800/60">
      <table className="w-full border-collapse" style={{ minWidth: '1100px' }}>
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/50">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => col.sortable && handleSort(col.key)}
                className={`px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                } ${col.sticky ? 'sticky left-0 bg-slate-100 dark:bg-slate-800/60 z-20 border-r border-slate-200 dark:border-slate-700/40' : ''} ${
                  col.sortable ? 'cursor-pointer select-none hover:bg-slate-200 dark:hover:bg-slate-700/60 text-slate-600 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                }`}
                style={col.sticky ? { minWidth: '140px' } : undefined}
              >
                <span className="inline-flex items-center">
                  {col.label}
                  {col.sortable && <SortIcon active={sortKey === col.key} direction={sortDir} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Area rows */}
          {sortedAreas.map((entry, i) => (
            <tr
              key={entry.area}
              className={`border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${
                i % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-slate-50/50 dark:bg-slate-800/10'
              }`}
            >
              <Td bold sticky bgColor={i % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-slate-50/50 dark:bg-slate-800/10'}>{entry.area}</Td>
              <Td align="right">{formatNumber(entry.bf)}</Td>
              <Td align="right">{formatNumber(entry.inc)}</Td>
              <Td align="right" bold>{formatNumber(entry.totalJo)}</Td>
              <Td align="right">{formatNumber(entry.completedFromTotal)}</Td>
              <Td align="right">{formatNumber(entry.completedFromRjo)}</Td>
              <Td align="right" bold>{formatNumber(entry.totalCompleted)}</Td>
              <Td align="right">{formatNumber(entry.rjoIncoming)}</Td>
              <Td align="right">{formatNumber(entry.rjoRedispatched)}</Td>
              <Td align="right" bold>{formatNumber(entry.totalRjo)}</Td>
              <Td align="right">{formatNumber(entry.carryOver)}</Td>
              <Td align="right" bold>{formatNumber(entry.mtd)}</Td>
              <Td align="right">{formatNumber(entry.target)}</Td>
              <Td align="center"><PctBadge value={entry.pct} /></Td>
            </tr>
          ))}

          {/* OVER ALL TOTAL row */}
          {dateData.overallTotal && (
            <tr className="bg-teal-50 dark:bg-teal-950/40 border-t-2 border-teal-300 dark:border-teal-700/50 font-bold">
              <Td bold sticky bgColor="bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300">
                OVER ALL TOTAL
              </Td>
              <Td align="right">{formatNumber(dateData.overallTotal.bf)}</Td>
              <Td align="right">{formatNumber(dateData.overallTotal.inc)}</Td>
              <Td align="right" bold>{formatNumber(dateData.overallTotal.totalJo)}</Td>
              <Td align="right">{formatNumber(dateData.overallTotal.completedFromTotal)}</Td>
              <Td align="right">{formatNumber(dateData.overallTotal.completedFromRjo)}</Td>
              <Td align="right" bold>{formatNumber(dateData.overallTotal.totalCompleted)}</Td>
              <Td align="right">{formatNumber(dateData.overallTotal.rjoIncoming)}</Td>
              <Td align="right">{formatNumber(dateData.overallTotal.rjoRedispatched)}</Td>
              <Td align="right" bold>{formatNumber(dateData.overallTotal.totalRjo)}</Td>
              <Td align="right">{formatNumber(dateData.overallTotal.carryOver)}</Td>
              <Td align="right" bold>{formatNumber(dateData.overallTotal.mtd)}</Td>
              <Td align="right">{formatNumber(dateData.overallTotal.target)}</Td>
              <Td align="center"><PctBadge value={dateData.overallTotal.pct} /></Td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
