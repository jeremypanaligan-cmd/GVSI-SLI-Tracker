/**
 * RjoReport — RJO Report module (shared across all plans).
 *
 * Displays the workbook's RJO tabs — PROVINCE | DOABLE | NOT DOABLE | FULL NAP — and lets the
 * reader switch between the combined tab and each plan's own breakdown:
 *   • All Plans          → the shared `RJO Report` tab
 *   • FIBERX / BIDA / SME → the `RJO-FIBERX` / `RJO-BIDA` / `RJO-SME` tabs
 *
 * Mirrors the Installation SLA Breakdown's behaviour (summary cards, sortable / searchable
 * province list, the sheet's own total row), with a different layout per breakpoint:
 *   • webview (sm+): a table with a proportional MIX bar per province
 *   • mobile (< sm): a card per province with the same bar and a three-up legend
 *
 * Each scope carries its plan's accent colour through the whole section.
 */
import { useState, useMemo } from 'react'
import { formatNumber } from '../utils/dataProcessor'

const COLUMNS = [
  { key: 'province', label: 'PROVINCE', sticky: true, sortable: true },
  { key: 'doable', label: 'DOABLE', align: 'right', sortable: true },
  { key: 'notDoable', label: 'NOT DOABLE', align: 'right', sortable: true },
  { key: 'fullNap', label: 'FULL NAP', align: 'right', sortable: true },
  { key: 'total', label: 'TOTAL', align: 'right', sortable: true },
  { key: 'mix', label: 'MIX', align: 'left', sortable: false },
]

// One entry per scope. The classes are written out in full because Tailwind only generates
// the utilities it can see in the source; every plan keeps its own accent throughout.
const SCOPES = [
  {
    key: 'all',
    label: 'All Plans',
    subtitle: 'Repair job orders by province — FIBERX + BIDA + SME combined',
    chip: 'bg-sky-500',
    text: 'text-sky-600 dark:text-sky-400',
    pill: 'bg-sky-500 border-sky-500',
    totalBg: 'bg-sky-50 dark:bg-sky-950',
    totalBorder: 'border-sky-300 dark:border-sky-700/50',
    totalText: 'text-sky-700 dark:text-sky-200',
    cardBorder: 'border-sky-200 dark:border-sky-700/40',
    cardBg: 'bg-sky-50/60 dark:bg-sky-950/30',
  },
  {
    key: 'fiberx',
    label: 'FIBERX',
    subtitle: 'FIBERX repair job orders grouped by province',
    chip: 'bg-[#5423C7]',
    text: 'text-[#5423C7] dark:text-[#b9a4f5]',
    pill: 'bg-[#5423C7] border-[#5423C7]',
    totalBg: 'bg-[#f3f0fd] dark:bg-[#171130]',
    totalBorder: 'border-[#5423C7]/40 dark:border-[#8f74e8]/50',
    totalText: 'text-[#3d1d94] dark:text-[#c4b3fb]',
    cardBorder: 'border-[#5423C7]/30 dark:border-[#8f74e8]/40',
    cardBg: 'bg-[#5423C7]/5 dark:bg-[#5423C7]/15',
  },
  {
    key: 'bida',
    label: 'BIDA',
    subtitle: 'BIDA repair job orders grouped by province',
    chip: 'bg-[#D32F2F]',
    text: 'text-[#D32F2F] dark:text-[#f0a3a3]',
    pill: 'bg-[#D32F2F] border-[#D32F2F]',
    totalBg: 'bg-[#fdf1f1] dark:bg-[#2a1213]',
    totalBorder: 'border-[#D32F2F]/40 dark:border-[#d97777]/50',
    totalText: 'text-[#a32323] dark:text-[#f0a3a3]',
    cardBorder: 'border-[#D32F2F]/30 dark:border-[#d97777]/40',
    cardBg: 'bg-[#D32F2F]/5 dark:bg-[#D32F2F]/15',
  },
  {
    key: 'sme',
    label: 'SME',
    subtitle: 'SME repair job orders grouped by province',
    chip: 'bg-[#008B74]',
    text: 'text-[#008B74] dark:text-[#7ad6c6]',
    pill: 'bg-[#008B74] border-[#008B74]',
    totalBg: 'bg-[#eef8f6] dark:bg-[#0b2521]',
    totalBorder: 'border-[#008B74]/40 dark:border-[#4fb3a2]/50',
    totalText: 'text-[#00695c] dark:text-[#7ad6c6]',
    cardBorder: 'border-[#008B74]/30 dark:border-[#4fb3a2]/40',
    cardBg: 'bg-[#008B74]/5 dark:bg-[#008B74]/15',
  },
]

const BUCKETS = [
  { key: 'doable', label: 'Doable', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'notDoable', label: 'Not Doable', bar: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
  { key: 'fullNap', label: 'Full Nap', bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
]

function Td({ children, align = 'left', bold = false, className = '', sticky = false, bgColor = '' }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''
  return (
    <td
      className={`px-3 py-2.5 text-sm whitespace-nowrap ${alignClass} ${bold ? 'font-bold' : 'font-medium'} ${className} ${sticky ? 'sticky left-0 z-[15] border-r border-slate-200 dark:border-slate-700/40' : ''} ${bgColor}`}
      style={sticky ? { minWidth: '150px' } : undefined}
    >
      {children}
    </td>
  )
}

function SortIcon({ active, direction, className = '' }) {
  if (!active) {
    return (
      <svg className="w-3 h-3 ml-1 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    )
  }
  return (
    <svg className={`w-3 h-3 ml-1 ${className} transition-transform ${direction === 'desc' ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  )
}

/** Proportional three-segment bar — the share each bucket holds of the row's total. */
function MixBar({ row, className = 'h-1.5' }) {
  const total = row.total || 0
  const width = (n) => (total > 0 ? `${((n || 0) / total) * 100}%` : '0%')
  return (
    <div className={`flex w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 ${className}`}>
      {BUCKETS.map((b) => (
        <span key={b.key} className={b.bar} style={{ width: width(row[b.key]) }} />
      ))}
    </div>
  )
}

/**
 * Mobile card (two-part style, < sm): province + total on top, the mix bar underneath,
 * then the three buckets as their own legend. OVERALL TOTAL stays pinned in the scope colour.
 */
function MobileCard({ row, overall, scope }) {
  const tone = scope || SCOPES[0]
  return (
    <div
      className={`rounded-xl border p-3 ${
        overall
          ? `${tone.totalBg} ${tone.totalBorder}`
          : 'border-slate-200 dark:border-slate-800/60 bg-white dark:bg-[#0c1220]'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className={`text-sm truncate ${overall ? `font-black ${tone.totalText}` : 'font-bold text-slate-800 dark:text-slate-100'}`}>
          {overall ? 'OVERALL TOTAL' : row.province}
        </p>
        <div className="text-right shrink-0">
          <p className={`text-lg font-black tabular-nums leading-none ${overall ? tone.totalText : 'text-slate-900 dark:text-white'}`}>
            {formatNumber(row.total)}
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Total RJO</p>
        </div>
      </div>

      <MixBar row={row} className="h-1.5 mt-2.5" />

      <div className="mt-2 grid grid-cols-3 gap-2">
        {BUCKETS.map((b) => (
          <div key={b.key} className="min-w-0">
            <p className={`text-[10px] font-bold uppercase tracking-wider ${b.text}`}>{b.label}</p>
            <p className="text-sm font-black tabular-nums text-slate-700 dark:text-slate-200">{formatNumber(row[b.key])}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, tone, accent }) {
  const tones = {
    green: 'border-emerald-200 dark:border-emerald-700/40 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300',
    red: 'border-rose-200 dark:border-rose-700/40 bg-rose-50/60 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300',
    amber: 'border-amber-200 dark:border-amber-700/40 bg-amber-50/60 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300',
    slate: 'border-slate-200 dark:border-slate-700/40 bg-slate-50/60 dark:bg-slate-800/30 text-slate-700 dark:text-slate-200',
  }
  const styling = accent ? `${accent.cardBorder} ${accent.cardBg} ${accent.text}` : (tones[tone] || tones.slate)
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${styling}`}>
      <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-xl sm:text-2xl font-black mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-[10px] sm:text-[11px] font-medium mt-0.5 opacity-70">{sub}</p>}
    </div>
  )
}

export default function RjoReport({ data, planData }) {
  const [scopeKey, setScopeKey] = useState('all')
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [search, setSearch] = useState('')

  const scope = SCOPES.find((s) => s.key === scopeKey) || SCOPES[0]
  const scoped = scopeKey === 'all' ? data : (planData && planData[scopeKey]) || null
  const rows = (scoped && scoped.rows) || []
  const overall = (scoped && scoped.overallTotal) || null

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((a, b) => {
      if (sortKey === 'province') {
        const cmp = String(a.province || '').localeCompare(String(b.province || ''))
        return sortDir === 'asc' ? cmp : -cmp
      }
      return sortDir === 'asc' ? (a[sortKey] || 0) - (b[sortKey] || 0) : (b[sortKey] || 0) - (a[sortKey] || 0)
    })
  }, [rows, sortKey, sortDir])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sortedRows
    return sortedRows.filter((r) => String(r.province || '').toLowerCase().includes(q))
  }, [sortedRows, search])

  const grand = overall ? overall.total : rows.reduce((s, r) => s + (r.total || 0), 0)
  const pctOf = (n) => (grand > 0 ? Math.round(((n || 0) / grand) * 100) : 0)
  const sumOf = (key) => (overall ? overall[key] : rows.reduce((s, r) => s + (r[key] || 0), 0))

  if (!data || !data.rows || data.rows.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto px-3 sm:px-6 py-8">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800/60 bg-white dark:bg-slate-900/40 p-10 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
            RJO Report — No Data
          </h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            No RJO data is available yet. Add the RJO Report tab to the shared workbook and
            sync to see the report here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1200px] mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
      {/* Heading */}
      <div>
        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <span className={`w-8 h-8 rounded-lg ${scope.chip} flex items-center justify-center shrink-0`}>
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </span>
          RJO Report
        </h2>
        <p className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 mt-1">
          {scope.subtitle}
        </p>
      </div>

      {/* Scope switch — the combined tab plus each plan's own breakdown */}
      <div className="flex flex-wrap items-center gap-1.5">
        {SCOPES.map((s) => {
          const isActive = s.key === scopeKey
          return (
            <button
              key={s.key}
              onClick={() => setScopeKey(s.key)}
              aria-pressed={isActive}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                isActive
                  ? `${s.pill} text-white shadow-sm`
                  : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {!scoped ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800/60 bg-white dark:bg-slate-900/40 px-4 py-10 text-center">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            No {scope.label} RJO data yet
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Publish the RJO-{scope.label} tab in the shared workbook and sync to see this breakdown.
          </p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <StatCard label="Total RJO" value={formatNumber(grand)} sub={`${rows.length} provinces`} accent={scope} />
            <StatCard label="Doable" value={formatNumber(sumOf('doable'))} sub={`${pctOf(sumOf('doable'))}% of total`} tone="green" />
            <StatCard label="Not Doable" value={formatNumber(sumOf('notDoable'))} sub={`${pctOf(sumOf('notDoable'))}% of total`} tone="red" />
            <StatCard label="Full Nap" value={formatNumber(sumOf('fullNap'))} sub={`${pctOf(sumOf('fullNap'))}% of total`} tone="amber" />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800/60 overflow-hidden">
            {/* Toolbar: search */}
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-slate-200 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/30">
              <div className="relative flex-1 min-w-[150px] max-w-xs">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search province…"
                  className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500/50 transition placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" title="Clear search">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {search && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  {filteredRows.length} of {rows.length} province{rows.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Mobile card list (< sm) */}
            <div className="sm:hidden space-y-2 p-2 bg-slate-50/40 dark:bg-slate-900/20">
              {filteredRows.map((r) => (
                <MobileCard key={r.province} row={r} scope={scope} />
              ))}

              {overall && <MobileCard row={overall} overall scope={scope} />}

              {filteredRows.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                  No provinces match “{search}”.
                </div>
              )}
            </div>

            {/* Desktop table (sm+) */}
            <div className="hidden sm:block w-full overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: '760px' }}>
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700/50">
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => col.sortable && handleSort(col.key)}
                        className={`px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
                          col.align === 'right' ? 'text-right' : ''
                        } ${col.sticky ? 'sticky left-0 bg-slate-100 dark:bg-[#111c2e] z-20 border-r border-slate-200 dark:border-slate-700/40' : ''} ${
                          col.sortable ? 'cursor-pointer select-none hover:bg-slate-200 dark:hover:bg-slate-700/60 text-slate-600 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                        }`}
                        style={col.sticky ? { minWidth: '140px' } : undefined}
                      >
                        <span className="inline-flex items-center">
                          {col.label}
                          {col.sortable && <SortIcon active={sortKey === col.key} direction={sortDir} className={scope.text} />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r, i) => (
                    <tr
                      key={r.province}
                      className={`group border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${
                        i % 2 === 0 ? 'bg-white dark:bg-[#0c1220]' : 'bg-slate-50/50 dark:bg-[#111c2e]'
                      }`}
                    >
                      <Td bold sticky bgColor={i % 2 === 0 ? 'bg-white dark:bg-[#0c1220]' : 'bg-slate-50/50 dark:bg-[#111c2e]'}>{r.province}</Td>
                      <Td align="right" className="text-emerald-600 dark:text-emerald-400">{formatNumber(r.doable)}</Td>
                      <Td align="right" className="text-rose-600 dark:text-rose-400">{formatNumber(r.notDoable)}</Td>
                      <Td align="right" className="text-amber-600 dark:text-amber-400">{formatNumber(r.fullNap)}</Td>
                      <Td align="right" bold>{formatNumber(r.total)}</Td>
                      <Td className="w-[180px]">
                        <div className="flex items-center gap-2">
                          <MixBar row={r} className="h-2 w-full max-w-[120px]" />
                          <span className="text-[10px] font-semibold tabular-nums text-slate-400 dark:text-slate-500 shrink-0">
                            {r.total > 0 ? `${Math.round(((r.doable || 0) / r.total) * 100)}%` : '—'}
                          </span>
                        </div>
                      </Td>
                    </tr>
                  ))}

                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                        No provinces match “{search}”.
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* OVERALL total row — pinned in the scope's colour */}
                {overall && (
                  <tfoot>
                    <tr className={`${scope.totalBg} border-t-2 ${scope.totalBorder} font-bold`}>
                      <Td bold sticky bgColor={`${scope.totalBg} ${scope.totalText}`}>
                        OVERALL TOTAL
                      </Td>
                      <Td align="right" className="text-emerald-700 dark:text-emerald-300">{formatNumber(overall.doable)}</Td>
                      <Td align="right" className="text-rose-700 dark:text-rose-300">{formatNumber(overall.notDoable)}</Td>
                      <Td align="right" className="text-amber-700 dark:text-amber-300">{formatNumber(overall.fullNap)}</Td>
                      <Td align="right">{formatNumber(overall.total)}</Td>
                      <Td>
                        <MixBar row={overall} className="h-2 w-full max-w-[120px]" />
                      </Td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
