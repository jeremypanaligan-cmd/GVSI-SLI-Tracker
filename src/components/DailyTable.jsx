/**
 * DailyTable — Displays RAW DATA for a specific date.
 * Shows area rows + OVER ALL TOTAL with achievement badges.
 */
import { formatNumber, getBadgeStyle } from '../utils/dataProcessor'

const COLUMNS = [
  { key: 'area', label: 'AREA', sticky: true },
  { key: 'bf', label: 'BF', align: 'right' },
  { key: 'inc', label: 'INC', align: 'right' },
  { key: 'totalJo', label: 'TOTAL JO', align: 'right', bold: true },
  { key: 'completedFromTotal', label: 'COMP FROM TOTAL', align: 'right' },
  { key: 'completedFromRjo', label: 'COMP FROM RJO', align: 'right' },
  { key: 'totalCompleted', label: 'TOTAL COMP', align: 'right', bold: true },
  { key: 'rjo', label: 'RJO', align: 'right' },
  { key: 'carryOver', label: 'CARRY OVER', align: 'right' },
  { key: 'mtd', label: 'MTD', align: 'right', bold: true },
  { key: 'target', label: 'TARGET', align: 'right' },
  { key: 'pct', label: '%', align: 'center', highlight: true },
]

function Td({ children, align = 'left', bold = false, highlight = false, className = '' }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''
  return (
    <td className={`px-3 py-2.5 text-sm whitespace-nowrap ${alignClass} ${bold ? 'font-bold' : 'font-medium'} ${className}`}>
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

export default function DailyTable({ dateData }) {
  if (!dateData || (!dateData.areas?.length && !dateData.overallTotal)) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400 dark:text-slate-600">
        <p className="text-sm">No data available for this date.</p>
      </div>
    )
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/50">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap ${
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                } ${col.sticky ? 'sticky left-0 bg-slate-100 dark:bg-slate-800/60 z-10' : ''}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Area rows */}
          {dateData.areas.map((entry, i) => (
            <tr
              key={entry.area}
              className={`border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${
                i % 2 === 0 ? 'bg-white dark:bg-transparent' : 'bg-slate-50/50 dark:bg-slate-800/10'
              }`}
            >
              <Td bold className="sticky left-0 bg-inherit z-10">{entry.area}</Td>
              <Td align="right">{formatNumber(entry.bf)}</Td>
              <Td align="right">{formatNumber(entry.inc)}</Td>
              <Td align="right" bold>{formatNumber(entry.totalJo)}</Td>
              <Td align="right">{formatNumber(entry.completedFromTotal)}</Td>
              <Td align="right">{formatNumber(entry.completedFromRjo)}</Td>
              <Td align="right" bold>{formatNumber(entry.totalCompleted)}</Td>
              <Td align="right">{formatNumber(entry.rjo)}</Td>
              <Td align="right">{formatNumber(entry.carryOver)}</Td>
              <Td align="right" bold>{formatNumber(entry.mtd)}</Td>
              <Td align="right">{formatNumber(entry.target)}</Td>
              <Td align="center"><PctBadge value={entry.pct} /></Td>
            </tr>
          ))}

          {/* OVER ALL TOTAL row */}
          {dateData.overallTotal && (
            <tr className="bg-teal-50 dark:bg-teal-950/40 border-t-2 border-teal-300 dark:border-teal-700/50 font-bold">
              <Td bold className="sticky left-0 bg-teal-50 dark:bg-teal-950/40 z-10 text-teal-700 dark:text-teal-300">
                OVER ALL TOTAL
              </Td>
              <Td align="right">{formatNumber(dateData.overallTotal.bf)}</Td>
              <Td align="right">{formatNumber(dateData.overallTotal.inc)}</Td>
              <Td align="right" bold>{formatNumber(dateData.overallTotal.totalJo)}</Td>
              <Td align="right">{formatNumber(dateData.overallTotal.completedFromTotal)}</Td>
              <Td align="right">{formatNumber(dateData.overallTotal.completedFromRjo)}</Td>
              <Td align="right" bold>{formatNumber(dateData.overallTotal.totalCompleted)}</Td>
              <Td align="right">{formatNumber(dateData.overallTotal.rjo)}</Td>
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
