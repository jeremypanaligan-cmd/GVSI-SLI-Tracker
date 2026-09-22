/**
 * YtdTable — the year-to-date half of the Provincial Breakdown.
 *
 * A sibling table to DailyTable rather than more columns on it: the daily table already
 * needs 1100px and answers a different question ("what happened on this date"). This one
 * answers "where is the year going" — actual against the plan to date, what is left of the
 * annual target, and the pace the remaining months need.
 *
 * Chrome follows the selected plan, and the pinned AREA / STATUS cells are opaque for the
 * same reason as the daily table's: they have to hide the columns scrolling beneath them.
 */
import { useMemo, useState } from 'react'
import { formatNumber, getBadgeStyle, getPaceBadgeStyle } from '../utils/dataProcessor'
import { exportYtdCSV } from '../utils/exportCSV'

const PACE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'on-pace', label: 'On pace' },
  { value: 'behind', label: 'Behind' },
  { value: 'critical', label: 'Critical' },
]

/** STATUS is pinned to the right, so every other column scrolls under it. */
const COLUMNS = [
  // Fixed width, and it matters: this is the only column without one, so without it the
  // auto table layout pours every spare pixel into AREA and the numbers drift right.
  { key: 'area', label: 'AREA', tooltip: 'Provincial / Region Area', sticky: true, sortable: true, width: 150 },
  { key: 'ytd', label: 'YTD', tooltip: 'Installations completed this year, through the selected month', align: 'right', bold: true, sortable: true, width: 92 },
  { key: 'planToDate', label: 'PLAN TO DATE', tooltip: 'Target for every month up to and including the selected one', align: 'right', sortable: true, width: 116 },
  { key: 'pctOfPlan', label: '% OF PLAN', tooltip: 'YTD against the plan to date — the fair yardstick mid-year', align: 'center', sortable: true, width: 100 },
  { key: 'annualTarget', label: 'ANNUAL TGT', tooltip: 'Full-year target for this province', align: 'right', sortable: true, width: 108 },
  { key: 'pct', label: '% OF TGT', tooltip: 'YTD against the whole-year target — where this province stands if the year ended today, unlike % OF PLAN, which only judges the months already elapsed. Tinted by the pace verdict, not by this percentage: mid-year every province is short of the annual target.', align: 'center', sortable: true, width: 100 },
  { key: 'remaining', label: 'REMAINING', tooltip: 'Annual target minus YTD — what is left for the rest of the year', align: 'right', sortable: true, width: 108 },
  { key: 'requiredPerMonth', label: 'REQ / MO', tooltip: 'Installations needed per remaining month, after this month’s own target', align: 'right', bold: true, sortable: true, width: 96 },
  { key: 'projected', label: 'PROJ', tooltip: 'Projected year-end if the finished months keep their average pace', align: 'right', sortable: true, width: 92 },
  { key: 'pace', label: 'PACE', tooltip: 'Judged on finished months — on pace, behind, or critical. A province whose target has not started yet says so instead of being given a verdict.', align: 'center', sortable: false, stickyRight: 0, width: 118 },
]

const DEFAULT_HEAD_ACCENT = {
  bg: 'bg-slate-100 dark:bg-slate-800/60',
  text: 'text-slate-600 dark:text-slate-300',
  border: 'border-slate-200 dark:border-slate-700/50',
}
const DEFAULT_TOTAL_ACCENT = {
  bg: 'bg-teal-50 dark:bg-[#0b262e]',
  text: 'text-teal-700 dark:text-teal-300',
  border: 'border-teal-300 dark:border-teal-700/50',
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthName(index) {
  return MONTH_LABELS[index] || ''
}

/**
 * A percentage chip. Pass `pace` for figures measured against the annual target: those are
 * *progress*, not a verdict — 46% in September is not a failure — and the monthly thresholds
 * would paint the whole column red. Tinted by the row's pace instead, the chip agrees with the
 * STATUS column beside it, so one row never carries two verdicts.
 */
function PctCell({ value, pace }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className="text-slate-300 dark:text-slate-600">—</span>
  }
  const badge = pace !== undefined ? getPaceBadgeStyle(pace) : getBadgeStyle(value)
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.bg} ${badge.color} ${badge.border || 'border-slate-300 dark:border-slate-600'}`}>
      {badge.pulse && <span className="w-1.5 h-1.5 rounded-full mr-1 bg-emerald-500 animate-pulse" />}
      {formatNumber(value, '%')}
    </span>
  )
}

function StatusCell({ pace, note }) {
  if (!pace) {
    // "—" reads as missing data. When there is a reason for having no verdict, name it.
    if (note) {
      return (
        <span
          className="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-600"
          title="No pace to report yet"
        >
          {note}
        </span>
      )
    }
    return <span className="text-slate-300 dark:text-slate-600">—</span>
  }
  const badge = getPaceBadgeStyle(pace)
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.bg} ${badge.color} ${badge.border}`}>
      {badge.pulse && <span className="w-1.5 h-1.5 rounded-full mr-1 bg-emerald-500 animate-pulse" />}
      {badge.label}
    </span>
  )
}

/** "70/mo" — a pace figure is read as a plan, so it rounds up, never down. */
function paceDisplay(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value <= 0 ? '0' : formatNumber(Math.ceil(value))
}

function SortIcon({ active, direction, colorClass }) {
  if (!active) {
    return (
      <svg className="w-3 h-3 ml-1 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    )
  }
  return (
    <svg className={`w-3 h-3 ml-1 ${colorClass || ''} transition-transform ${direction === 'desc' ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  )
}

function Td({ children, align = 'left', bold = false, className = '', sticky = false, stickyRight, bgColor = '', width }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''
  return (
    <td
      className={`px-3 py-2.5 text-sm whitespace-nowrap ${alignClass} ${bold ? 'font-bold' : 'font-medium'} ${className} ${
        sticky ? 'sticky left-0 z-[15] border-r border-slate-200 dark:border-slate-700/40' : ''
      } ${
        stickyRight !== undefined ? 'sticky right-0 z-[15] border-l border-slate-200 dark:border-slate-700/40 shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.35)] dark:shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.6)]' : ''
      } ${bgColor}`}
      style={sticky ? { minWidth: '150px', width: '150px' } : stickyRight !== undefined ? { minWidth: `${width}px`, width: `${width}px`, right: `${stickyRight}px` } : width ? { minWidth: `${width}px`, width: `${width}px` } : undefined}
    >
      {children}
    </td>
  )
}

/** Mobile card row (< sm): name + status on the left, YTD and what is left on the right. */
function MobileRow({ row, totalAccent = DEFAULT_TOTAL_ACCENT, overall = false }) {
  return (
    <div className={`flex items-start justify-between gap-3 px-3.5 py-3 ${overall ? totalAccent.bg : ''}`}>
      <div className="min-w-0">
        <p className={`text-sm truncate ${overall ? `font-black ${totalAccent.text}` : 'font-bold text-slate-800 dark:text-slate-100'}`}>
          {row.name}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
          <StatusCell pace={row.pace} note={row.paceNote} />
          {/* Mobile has no column header to name the yardstick, so the badge is labelled
              here — and the label is the annual one, matching the target printed below it. */}
          <span className="inline-flex items-baseline gap-1" title="YTD against the whole-year target">
            <PctCell value={row.pct} pace={row.pace} />
            <span className="text-[10px] text-slate-400 dark:text-slate-500">of target</span>
          </span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
          Annual target {formatNumber(row.annualTarget)}
          {row.requiredPerMonth !== null && row.requiredPerMonth > 0
            ? <> · need {paceDisplay(row.requiredPerMonth)}/mo</>
            : null}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-base font-black tabular-nums leading-tight text-slate-800 dark:text-slate-100">{formatNumber(row.ytd)}</p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{formatNumber(row.remaining)} to go</p>
      </div>
    </div>
  )
}

export default function YtdTable({ ytd, accent, planName }) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [paceFilter, setPaceFilter] = useState('all')

  const headAccent = accent?.head || DEFAULT_HEAD_ACCENT
  const totalAccent = accent?.total || DEFAULT_TOTAL_ACCENT
  const chipActive = accent?.bg
    ? `${accent.bg} border-transparent text-white shadow-sm`
    : 'bg-teal-600 border-teal-600 text-white shadow-sm shadow-teal-600/20'

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const areas = useMemo(() => {
    if (!ytd?.areas) return []
    const list = sortKey
      ? [...ytd.areas].sort((a, b) => {
          if (sortKey === 'area') {
            const cmp = String(a.name || '').localeCompare(String(b.name || ''))
            return sortDir === 'asc' ? cmp : -cmp
          }
          const av = Number.isFinite(a[sortKey]) ? a[sortKey] : -Infinity
          const bv = Number.isFinite(b[sortKey]) ? b[sortKey] : -Infinity
          return sortDir === 'asc' ? av - bv : bv - av
        })
      : ytd.areas
    return paceFilter === 'all' ? list : list.filter((row) => row.pace === paceFilter)
  }, [ytd, sortKey, sortDir, paceFilter])

  if (!ytd) {
    return (
      <div className="m-4 sm:m-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 p-6 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Year-to-date figures are not published for {planName || 'this plan'} yet — the
          <span className="font-semibold"> YTD 2026</span> and <span className="font-semibold">TARGET 2026</span> tabs
          hold BIDA and FIBERX only.
        </p>
      </div>
    )
  }

  const { overall } = ytd
  const recordNote = ytd.closedRecordMonths?.length
    ? `${ytd.closedRecordMonths.map((index) => `${monthName(index)} ${ytd.year ?? ''}`.trim()).join(', ')} ${ytd.closedRecordMonths.length > 1 ? 'come' : 'comes'} from the tracker's own record, not the worksheet`
    : null

  return (
    <div className="m-4 sm:m-6 rounded-xl border border-slate-200 dark:border-slate-800/60 overflow-hidden">
      {/* Header: what this table is, and which months are behind it */}
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 border-b ${headAccent.border} ${headAccent.bg}`}>
        <h3 className={`text-xs font-bold uppercase tracking-widest ${headAccent.text}`}>Year-to-Date</h3>
        <span className={`text-[11px] font-semibold ${headAccent.text} opacity-75`}>
          {monthName(0)}–{monthName(ytd.monthIndex)} {ytd.year ?? ''}
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {ytd.monthsAfter > 0
            ? `${ytd.monthsAfter} month${ytd.monthsAfter === 1 ? '' : 's'} left after ${monthName(ytd.monthIndex)}`
            : 'final month of the year'}
        </span>
        {recordNote && (
          <span className="text-[10px] text-slate-500 dark:text-slate-400 italic" title="The app's own record wins for any month it holds, including archived months">
            {recordNote}
          </span>
        )}

        <div className="flex items-center gap-1.5 flex-wrap sm:ml-auto">
          {PACE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setPaceFilter(filter.value)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all duration-200 ${
                paceFilter === filter.value
                  ? chipActive
                  : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/50 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60'
              }`}
            >
              {filter.label}
            </button>
          ))}

          {/* The pace filter narrows what is on screen; the file always holds every province,
              because the OVER ALL TOTAL row it carries covers all of them. */}
          <button
            onClick={() => exportYtdCSV(ytd, { planName })}
            title="Export this table as CSV — all provinces, one row each, with the overall total"
            aria-label="Export year-to-date table as CSV"
            className="ml-1 p-1.5 rounded-full border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 hover:text-slate-700 dark:hover:text-slate-200 transition-all duration-200"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile card list (< sm) */}
      <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800/40 bg-white dark:bg-[#0c1220]">
        {areas.map((row) => (
          <MobileRow key={row.key} row={row} />
        ))}
        <MobileRow row={overall} overall />
        {areas.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            No provinces with {paceFilter} status.
          </p>
        )}
      </div>

      {/* Desktop table (sm+) */}
      <div className="hidden sm:block w-full overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: '1100px' }}>
          <thead>
            <tr className={`${headAccent.bg} border-b ${headAccent.border}`}>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && handleSort(col.key)}
                  title={col.tooltip}
                  className={`px-3 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''
                  } ${col.sticky ? `sticky left-0 ${headAccent.bg} z-20 border-r border-slate-200 dark:border-slate-700/40` : ''} ${
                    col.stickyRight !== undefined ? `sticky right-0 ${headAccent.bg} z-20 border-l border-slate-200 dark:border-slate-700/40 shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.35)] dark:shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.6)]` : ''
                  } ${
                    col.sortable ? `cursor-pointer select-none hover:bg-black/5 dark:hover:bg-white/10 ${headAccent.text}` : `${headAccent.text} opacity-75`
                  }`}
                  style={col.sticky ? { minWidth: `${col.width}px`, width: `${col.width}px` } : col.stickyRight !== undefined ? { minWidth: `${col.width}px`, width: `${col.width}px`, right: `${col.stickyRight}px` } : { minWidth: `${col.width}px`, width: `${col.width}px` }}
                >
                  <span className="inline-flex items-center">
                    {col.label}
                    {col.sortable && <SortIcon active={sortKey === col.key} direction={sortDir} colorClass={accent?.text} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {areas.map((row, index) => {
              const bg = index % 2 === 0 ? 'bg-white dark:bg-[#0c1220]' : 'bg-slate-50/50 dark:bg-[#111c2e]'
              return (
                <tr key={row.key} className={`group border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${bg}`}>
                  <Td bold sticky bgColor={bg}>{row.name}</Td>
                  <Td align="right" bold>{formatNumber(row.ytd)}</Td>
                  <Td align="right">{formatNumber(row.planToDate)}</Td>
                  <Td align="center"><PctCell value={row.pctOfPlan} /></Td>
                  <Td align="right">{formatNumber(row.annualTarget)}</Td>
                  <Td align="center"><PctCell value={row.pct} pace={row.pace} /></Td>
                  <Td align="right">
                    <span title={row.deficit > 0 ? `${formatNumber(row.deficit)} behind the plan to date` : `${formatNumber(-row.deficit)} ahead of the plan to date`}>
                      {formatNumber(row.remaining)}
                    </span>
                  </Td>
                  <Td align="right" bold>{paceDisplay(row.requiredPerMonth)}</Td>
                  <Td align="right">{formatNumber(Math.round(row.projected))}</Td>
                  <Td align="center" stickyRight={0} width={118} bgColor={bg}><StatusCell pace={row.pace} note={row.paceNote} /></Td>
                </tr>
              )
            })}

            {/* OVER ALL TOTAL — opaque, in the plan accent, so the pinned cells mask the
                columns scrolling under them */}
            <tr className={`${totalAccent.bg} border-t-2 ${totalAccent.border} font-bold`}>
              <Td bold sticky bgColor={`${totalAccent.bg} ${totalAccent.text}`}>{overall.name}</Td>
              <Td align="right" bold>{formatNumber(overall.ytd)}</Td>
              <Td align="right">{formatNumber(overall.planToDate)}</Td>
              <Td align="center" className={totalAccent.text}><PctCell value={overall.pctOfPlan} /></Td>
              <Td align="right">{formatNumber(overall.annualTarget)}</Td>
              <Td align="center" className={totalAccent.text}><PctCell value={overall.pct} pace={overall.pace} /></Td>
              <Td align="right">{formatNumber(overall.remaining)}</Td>
              <Td align="right" bold>{paceDisplay(overall.requiredPerMonth)}</Td>
              <Td align="right">{formatNumber(Math.round(overall.projected))}</Td>
              <Td align="center" stickyRight={0} width={118} bgColor={`${totalAccent.bg} ${totalAccent.text}`}><StatusCell pace={overall.pace} note={overall.paceNote} /></Td>
            </tr>

            {areas.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                  No provinces with {paceFilter} status.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
