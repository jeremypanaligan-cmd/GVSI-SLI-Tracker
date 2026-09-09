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
import { formatNumber, getBadgeStyle, computeAreaPace, getPaceBadgeStyle } from '../utils/dataProcessor'
import Sparkline from './Sparkline'

const PACE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'on-pace', label: 'On pace' },
  { value: 'behind', label: 'Behind' },
  { value: 'critical', label: 'Critical' },
]

const COLUMNS = [
  { key: 'area', label: 'AREA', sticky: true, sortable: true },
  { key: 'bf', label: 'BF', align: 'right', sortable: true },
  { key: 'inc', label: 'INC', align: 'right', sortable: true },
  { key: 'totalJo', label: 'TTL JO', align: 'right', bold: true, sortable: true },
  { key: 'completedFromTotal', label: 'COMP TTL', align: 'right', sortable: true },
  { key: 'completedFromRjo', label: 'COMP RJO', align: 'right', sortable: true },
  { key: 'totalCompleted', label: 'TTL COMP', align: 'right', bold: true, sortable: true },
  { key: 'rjoIncoming', label: 'RJO INC', align: 'right', sortable: true },
  { key: 'rjoRedispatched', label: 'RJO FPMos', align: 'right', sortable: true },
  { key: 'totalRjo', label: 'TTL RJO', align: 'right', bold: true, sortable: true },
  { key: 'carryOver', label: 'CO', align: 'right', sortable: true },
  { key: 'mtd', label: 'MTD', align: 'right', bold: true, sortable: true },
  { key: 'target', label: 'TARGET', align: 'right', sortable: true },
  { key: 'pct', label: '%', align: 'center', highlight: true, sortable: true },
  { key: 'pace', label: 'PACE', align: 'center', sortable: false },
  { key: 'trend', label: '7D TREND', align: 'center', sortable: false },
]

function Td({ children, align = 'left', bold = false, highlight = false, className = '', sticky = false, bgColor = '' }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''
  return (
    <td className={`px-3 py-2.5 text-sm whitespace-nowrap ${alignClass} ${bold ? 'font-bold' : 'font-medium'} ${className} ${sticky ? 'sticky left-0 z-[15] border-r border-slate-200 dark:border-slate-700/40 group-hover:bg-slate-50 dark:group-hover:bg-slate-800' : ''} ${bgColor}`}
      style={sticky ? { minWidth: '150px' } : undefined}
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

function PaceBadge({ entry, refDate }) {
  const proj = refDate ? computeAreaPace(entry, refDate) : null
  if (!proj) return <span className="text-slate-300 dark:text-slate-600">—</span>
  const badge = getPaceBadgeStyle(proj.pace)
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.bg} ${badge.color} ${badge.border}`}>
      {badge.pulse && <span className="w-1.5 h-1.5 rounded-full mr-1 bg-emerald-500 animate-pulse" />}
      {badge.label}
    </span>
  )
}

/**
 * Mobile card row (two-line style, < sm): mirrors the Lumen Billing list
 * layout — province name + pace badge + MTD/TARGET ("due") on the left,
 * achievement % ("amount") on the right.
 */
function MobileRow({ entry, refDate, overall }) {
  const badge = getBadgeStyle(entry.pct)
  const pctDisplay = Number.isFinite(entry.pct) ? formatNumber(entry.pct, '%') : '—'
  return (
    <div className={`flex items-center justify-between gap-3 px-3.5 py-3 ${overall ? 'bg-teal-50 dark:bg-teal-950/40' : ''}`}>
      <div className="min-w-0">
        <p className={`text-sm truncate ${overall ? 'font-black text-teal-700 dark:text-teal-300' : 'font-bold text-slate-800 dark:text-slate-100'}`}>
          {entry.area}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
          <PaceBadge entry={entry} refDate={refDate} />
          <span className="text-xs text-slate-500 dark:text-slate-300">
            <span className="font-bold text-slate-700 dark:text-slate-100">MTD {formatNumber(entry.mtd)}</span>
            <span className="mx-1 opacity-60">·</span>
            <span className="font-bold text-slate-700 dark:text-slate-100">TGT {formatNumber(entry.target)}</span>
          </span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-base font-black tabular-nums leading-tight ${badge.color}`}>{pctDisplay}</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">CO {formatNumber(entry.carryOver)}</p>
      </div>
    </div>
  )
}

function TrendCell({ areaName, areaTrends, overall }) {
  const tr = areaTrends && areaTrends[areaName]
  if (!tr || tr.values.length < 2) {
    return <span className="text-slate-300 dark:text-slate-600">—</span>
  }
  const up = tr.dayDelta > 0
  const flat = tr.dayDelta === 0
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Sparkline
        data={tr.values}
        width={54}
        height={16}
        positive={up || flat}
        strokeClass={overall ? 'text-teal-600 dark:text-teal-300' : undefined}
      />
      <span
        className={`inline-flex items-center text-[10px] font-semibold shrink-0 ${flat ? 'text-slate-400 dark:text-slate-500' : up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
        title={`7-day completions: ${tr.values.join(' → ')}`}
      >
        {flat ? '±0' : up ? `+${tr.dayDelta}` : tr.dayDelta}
      </span>
    </div>
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

export default function DailyTable({ dateData, refDate, areaTrends }) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [search, setSearch] = useState('')
  const [paceFilter, setPaceFilter] = useState('all')

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

  // Area search + pace filter (Phase 3 — F4)
  const filteredAreas = useMemo(() => {
    let list = sortedAreas
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((a) => String(a.area || '').toLowerCase().includes(q))
    }
    if (paceFilter !== 'all') {
      list = list.filter((a) => {
        const proj = refDate ? computeAreaPace(a, refDate) : null
        return proj && proj.pace === paceFilter
      })
    }
    return list
  }, [sortedAreas, search, paceFilter, refDate])

  if (!dateData || (!dateData.areas?.length && !dateData.overallTotal)) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400 dark:text-slate-600">
        <p className="text-sm">No data available for this date.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800/60 overflow-hidden">
      {/* Toolbar: area search + pace filter chips */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-slate-200 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/30">
        <div className="relative flex-1 min-w-[150px] max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search area…"
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500/50 transition placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" title="Clear search">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {PACE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setPaceFilter(f.value)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all duration-200 ${
                paceFilter === f.value
                  ? 'bg-teal-600 border-teal-600 text-white shadow-sm shadow-teal-600/20'
                  : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/50 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {(search || paceFilter !== 'all') && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {filteredAreas.length} of {sortedAreas.length} area{sortedAreas.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Mobile card list (< sm) — two-line rows */}
      <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800/40">
        {filteredAreas.map((entry) => (
          <MobileRow key={entry.area} entry={entry} refDate={refDate} />
        ))}

        {dateData.overallTotal && (
          <MobileRow entry={dateData.overallTotal} refDate={refDate} overall />
        )}

        {filteredAreas.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            No areas match {search ? `“${search}”` : 'the current filter'}{paceFilter !== 'all' ? ` with ${paceFilter} pace` : ''}.
          </div>
        )}
      </div>

      {/* Desktop table (sm+) */}
      <div className="hidden sm:block w-full overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: '1100px' }}>
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/50">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => col.sortable && handleSort(col.key)}
                className={`px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                } ${col.sticky ? 'sticky left-0 bg-slate-100 dark:bg-[#111c2e] z-20 border-r border-slate-200 dark:border-slate-700/40' : ''} ${
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
          {filteredAreas.map((entry, i) => (
            <tr
              key={entry.area}
              className={`group border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${
                i % 2 === 0 ? 'bg-white dark:bg-[#0c1220]' : 'bg-slate-50/50 dark:bg-[#111c2e]'
              }`}
            >
              <Td bold sticky bgColor={i % 2 === 0 ? 'bg-white dark:bg-[#0c1220]' : 'bg-slate-50/50 dark:bg-[#111c2e]'}>{entry.area}</Td>
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
              <Td align="center"><PaceBadge entry={entry} refDate={refDate} /></Td>
              <Td align="center"><TrendCell areaName={entry.area} areaTrends={areaTrends} /></Td>
            </tr>
          ))}

          {/* OVER ALL TOTAL row */}
          {dateData.overallTotal && (
            <tr className="bg-teal-50 dark:bg-teal-950/40 border-t-2 border-teal-300 dark:border-teal-700/50 font-bold">
              <Td bold sticky bgColor="bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300">
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
              <Td align="center"><PaceBadge entry={dateData.overallTotal} refDate={refDate} /></Td>
              <Td align="center"><TrendCell areaName="OVER ALL TOTAL" areaTrends={areaTrends} overall /></Td>
            </tr>
          )}

          {/* No-match state (filter/search active but nothing found) */}
          {filteredAreas.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                No areas match {search ? `“${search}”` : 'the current filter'}{paceFilter !== 'all' ? ` with ${paceFilter} pace` : ''}.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  )
}
