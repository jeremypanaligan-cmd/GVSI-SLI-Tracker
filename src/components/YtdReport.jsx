/**
 * YtdReport — the year-to-date section of the Executive Overview.
 *
 * The Month-to-Date section answers "how is this month going". This one answers "how is
 * the year going": actual against the plan to date, what is left of the annual target, the
 * pace the remaining months need, and where the year lands if the current pace holds.
 *
 * Two different yardsticks on purpose, and both are labelled:
 *   · the headline is against the **plan to date**, because in September a province at 47%
 *     of its annual target is not failing — it has had eight months
 *   · the bar is against the **annual target**, because that is the number being filled
 *
 * The verdict (on pace / behind / critical) is judged on finished months only, so nothing
 * screams on the second day of a month. See computeYtd() in utils/yearTables.js.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatNumber, formatNumberExact, formatCompact, getBadgeStyle, getPaceBadgeStyle } from '../utils/dataProcessor'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function Badge({ label, color, bg, border, pulse }) {
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${bg} ${color} ${border}`}>
      {pulse && <span className="w-1.5 h-1.5 rounded-full mr-1 bg-emerald-500 animate-pulse" />}
      {label}
    </span>
  )
}

/**
 * One month of the strip: what it delivered against what it was asked for.
 *
 * The delivered figure is shortened on a narrow screen — 413.2k rather than 413,275 — because
 * twelve cells share the strip and a seven-figure number spills into its neighbour. The full
 * figure stays in the cell's title, and it comes back at `lg` where the cells are wide.
 *
 * On a collection plan the delivered figure is money, so the full figure keeps its centavos —
 * 465,023.00 rather than 465,023. The shortened form cannot: it is a `k`-suffixed glance by
 * design. The target underneath stays a whole figure, like every other target in the app.
 *
 * The cell is a button, not a box: it opens the month's own details (`MonthDetailModal`). The
 * tooltip stays for a pointer, but a `title` is unreachable by touch, and a phone is where the
 * strip is too narrow to read anyway.
 */
function MonthCell({ index, actual, target, future, accentText, collectionBased = false, onOpen }) {
  const hasActual = typeof actual === 'number' && Number.isFinite(actual)
  const fill = !future && target > 0 && hasActual ? Math.min((actual / target) * 100, 100) : 0
  const hit = !future && target > 0 && hasActual && actual >= target
  const ratio = !future && target > 0 && hasActual ? (actual / target) * 100 : null

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className={`flex-1 min-w-[64px] rounded-lg border px-1.5 py-2 text-center cursor-pointer transition hover:border-slate-300 hover:shadow-sm dark:hover:border-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 ${
        future
          ? 'border-dashed border-slate-200 dark:border-slate-800 bg-transparent opacity-55 hover:opacity-100'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40'
      }`}
      title={future
        ? `${MONTH_LABELS[index]} · target ${formatNumber(target)}, not yet reached`
        : `${MONTH_LABELS[index]} · ${fullFigure(actual, collectionBased)} of ${formatNumber(target)} target${ratio != null ? ` (${ratio.toFixed(0)}%)` : ''}`}
    >
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{MONTH_LABELS[index]}</p>
      <p className={`text-[13px] font-black tabular-nums leading-tight mt-0.5 ${
        future ? 'text-slate-300 dark:text-slate-600' : hit ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'
      }`}>
        {future || !hasActual ? '—' : (
          <>
            <span className="hidden lg:inline">{fullFigure(actual, collectionBased)}</span>
            <span className="lg:hidden">{formatCompact(actual)}</span>
          </>
        )}
      </p>
      <div className="h-1 mt-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${hit ? 'bg-emerald-500' : accentText ? `${accentText} bg-current opacity-70` : 'bg-teal-500'}`}
          style={{ width: `${fill}%` }}
        />
      </div>
      <p className="text-[8px] text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">{formatNumber(target)}</p>
    </button>
  )
}

/** The full figure in the plan's own unit — money on a collection plan, a count otherwise. */
function fullFigure(value, collectionBased) {
  return collectionBased ? formatNumberExact(value) : formatNumber(value)
}

/** One line of the month's details: a label on the left, the figure on the right. */
function DetailRow({ label, value, tone = 'text-slate-800 dark:text-slate-100', big = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
      <span className={`tabular-nums ${big ? 'text-xl font-black' : 'text-sm font-bold'} ${tone}`}>{value}</span>
    </div>
  )
}

/**
 * The month's own figures, laid out — what the cell's tooltip says, for a screen that cannot
 * hover. Tapping a cell in the Monthly Progress strip opens this: the delivered figure, the
 * month's target, and the same percentage the tooltip carries. A month that has not been
 * reached yet has no delivered figure to show, so it says so instead of reading as a zero.
 *
 * Exported so a probe can render the card directly — `createPortal` renders nothing on a
 * server, which is where the rest of this file is checked.
 */
export function MonthDetailCard({ index, year, actual, target, future, collectionBased = false, onClose }) {
  const label = `${MONTH_LABELS[index]}${year ? ` ${year}` : ''}`
  const hasActual = typeof actual === 'number' && Number.isFinite(actual)
  const ratio = !future && target > 0 && hasActual ? (actual / target) * 100 : null
  const hit = !future && target > 0 && hasActual && actual >= target

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="month-detail-title"
      onClick={(e) => e.stopPropagation()}
      className="w-full max-w-xs rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#0E1622] shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <h3 id="month-detail-title" className="flex items-baseline gap-2 text-sm font-black tracking-tight text-slate-800 dark:text-slate-100">
          {label}
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Monthly Progress</span>
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="px-4 py-4 space-y-3">
        {future ? (
          <>
            <DetailRow label="Monthly target" value={formatNumber(target)} />
            <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
              Not yet reached — this month has not been reported yet.
            </p>
          </>
        ) : (
          <>
            <DetailRow
              label="Delivered"
              value={fullFigure(actual, collectionBased)}
              big
              tone={hit ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}
            />
            <DetailRow label="Monthly target" value={formatNumber(target)} />
            <DetailRow label="Of target" value={ratio != null ? `${ratio.toFixed(0)}%` : '—'} />
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full px-4 py-3 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
      >
        Close
      </button>
    </div>
  )
}

/**
 * The dialog itself: the details sit in a portaled overlay so the strip's own horizontal
 * scroll cannot clip them. A sheet on a phone, a centered card from `sm` up. Backdrop click
 * and Escape both close it, the way the Executive Report does.
 */
function MonthDetailModal({ onClose, ...rest }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-slate-900/70 dark:bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <MonthDetailCard onClose={onClose} {...rest} />
    </div>,
    document.body,
  )
}

export default function YtdReport({ ytd, plan, planName }) {
  // Which month's details are open, if any. Declared before the early return below — a hook
  // cannot sit behind a condition.
  const [openMonth, setOpenMonth] = useState(null)
  const pc = plan?.accentClasses || {}
  // SME measures collected money, so the strip's month figures are amounts, not counts.
  const collectionBased = Boolean(plan?.collectionBased)

  if (!ytd) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-1.5 h-5 rounded-full bg-gradient-to-b ${pc.bg || 'bg-teal-500'}`} />
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Year-to-Date</h2>
        </div>
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 p-6 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No year-to-date figures for {planName || 'this plan'} — no 2026 block for it came back from the
            <span className="font-semibold"> YTD 2026</span> and <span className="font-semibold">TARGET 2026</span> tabs,
            and the tracker's own record holds no month of 2026 for this plan yet.
          </p>
        </div>
      </section>
    )
  }

  const { overall, monthIndex, months, year } = ytd
  // The year tabs could not be read, so this section was built from the tracker's own record:
  // every month it holds is here, the annual targets are not. Anything measured against the
  // year is absent rather than partial (`annualTargetsKnown` in computeYtd) — the plan-to-date
  // yardstick, which is the headline, needs only the months that have happened.
  const annualTargetKnown = overall.annualTargetKnown !== false
  const planBadge = overall.pctOfPlan != null ? getBadgeStyle(overall.pctOfPlan) : null
  const paceBadge = overall.pace ? getPaceBadgeStyle(overall.pace) : null
  const annualPct = overall.pct != null ? Math.min(overall.pct, 100) : 0
  const accentText = pc.text || 'text-teal-600 dark:text-teal-400'

  const behind = overall.deficit > 0
  const recordNote = ytd.closedRecordMonths?.length
    ? `${ytd.closedRecordMonths.map((index) => MONTH_LABELS[index]).join(', ')} ${year ?? ''} taken from the tracker's own record`
    : null

  return (
    <section>
      {/* Section header */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-3">
        <div className={`w-1.5 h-5 rounded-full bg-gradient-to-b ${pc.bg || 'bg-teal-500'}`} />
        <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Year-to-Date</h2>
        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-[#0E1622] border border-slate-200 dark:border-slate-700/60 px-2.5 py-1 rounded-lg">
          {MONTH_LABELS[0]}–{MONTH_LABELS[monthIndex]} {year ?? ''}
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {ytd.monthsAfter > 0
            ? `${ytd.monthsAfter} month${ytd.monthsAfter === 1 ? '' : 's'} left`
            : 'final month of the year'}
        </span>
      </div>

      {!annualTargetKnown && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-2 mb-3">
          <p className="text-[11px] text-amber-800 dark:text-amber-200">
            The <span className="font-semibold">YTD 2026</span> and <span className="font-semibold">TARGET 2026</span> tabs
            could not be read, so this section is built from the tracker's own record — every month it holds, plus the
            live month's own target off the <span className="font-semibold">MTD</span> tab. The annual targets and the
            months still to come are not known, so what depends on them reads as a dash instead of a guess.
          </p>
        </div>
      )}

      {/* Hero: actual against the plan to date */}
      <div className={`relative overflow-hidden rounded-2xl border p-5 mb-3 ${
        planBadge?.pulse ? 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-800/50'
          : planBadge?.label === 'LAG' ? 'bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20 border-amber-200 dark:border-amber-800/50'
            : 'bg-gradient-to-br from-rose-50 to-rose-100/50 dark:from-rose-950/40 dark:to-rose-900/20 border-rose-200 dark:border-rose-800/50'
      }`}>
        <div className={`absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20 ${
          planBadge?.pulse ? 'bg-emerald-400' : planBadge?.label === 'LAG' ? 'bg-amber-400' : 'bg-rose-400'
        }`} />

        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Against the plan to date</p>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={`text-4xl sm:text-5xl font-black tracking-tight ${
                planBadge?.pulse ? 'text-emerald-600 dark:text-emerald-300'
                  : planBadge?.label === 'LAG' ? 'text-amber-600 dark:text-amber-300'
                    : 'text-rose-600 dark:text-rose-300'
              }`}>
                {overall.pctOfPlan != null ? overall.pctOfPlan.toFixed(1) : '—'}%
              </span>
              {planBadge && <Badge {...planBadge} />}
              {paceBadge && <Badge {...paceBadge} />}
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
              <span className="font-semibold text-slate-700 dark:text-slate-200">{formatNumber(overall.ytd)}</span> of{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">{formatNumber(overall.planToDate)}</span> planned
              {' · '}
              {behind
                ? <span className="font-semibold text-amber-600 dark:text-amber-400">{formatNumber(overall.deficit)} behind</span>
                : <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatNumber(-overall.deficit)} ahead</span>}
            </p>

            <p className={`text-[11px] font-semibold mt-1 ${paceBadge?.color || 'text-slate-500 dark:text-slate-400'}`}>
              {overall.pace
                ? `At ${formatNumber(Math.round(overall.paceMonthly))}/month, the year ends at ${formatNumber(Math.round(overall.projected))}`
                : `${formatNumber(Math.round(overall.projected))} projected by year-end`}
              {overall.projectedPct != null ? ` (${overall.projectedPct.toFixed(0)}% of target)` : ''}
            </p>
          </div>

          {/* Progress bar — against the annual target, the number actually being filled */}
          <div className="flex-1 max-w-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {annualTargetKnown ? 'Of annual target' : 'Of annual target — not available'}
              </span>
              <span className={`text-xs font-bold ${
                planBadge?.pulse ? 'text-emerald-600 dark:text-emerald-300'
                  : planBadge?.label === 'LAG' ? 'text-amber-600 dark:text-amber-300'
                    : 'text-rose-600 dark:text-rose-300'
              }`}>
                {overall.pct != null ? `${overall.pct.toFixed(1)}%` : '—'}
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-white/60 dark:bg-slate-800/60 overflow-hidden shadow-inner">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  planBadge?.pulse ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                    : planBadge?.label === 'LAG' ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                      : 'bg-gradient-to-r from-rose-500 to-rose-400'
                }`}
                style={{ width: annualPct + '%' }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-slate-400 dark:text-slate-500">0</span>
              <span className="text-[9px] text-slate-400 dark:text-slate-500">
                {annualTargetKnown ? formatNumber(overall.annualTarget) : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 flex flex-col justify-between">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">YTD Completed</p>
          <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">{formatNumber(overall.ytd)}</span>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
            {overall.completedMonths > 0
              ? `${formatNumber(Math.round(overall.paceMonthly))}/month across ${overall.completedMonths} finished month${overall.completedMonths === 1 ? '' : 's'}`
              : 'no finished month yet'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 flex flex-col justify-between">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Annual Target</p>
          <span className={`text-3xl sm:text-4xl font-black tracking-tight ${annualTargetKnown ? accentText : 'text-slate-400 dark:text-slate-500'}`}>
            {annualTargetKnown ? formatNumber(overall.annualTarget) : '—'}
          </span>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
            {annualTargetKnown
              ? `${formatNumber(overall.planToDate)} planned through ${MONTH_LABELS[monthIndex]}`
              : 'the two year tabs could not be read'}
          </p>
        </div>

        <div className={`rounded-2xl border p-5 flex flex-col justify-between ${
          !annualTargetKnown
            ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60'
            : overall.remaining > 0
              ? 'border-amber-200 dark:border-amber-800/50 bg-gradient-to-br from-amber-50/80 to-white dark:from-amber-950/20 dark:to-slate-900/60'
              : 'border-emerald-200 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/20 dark:to-slate-900/60'
        }`}>
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Remaining</p>
          <span className={`text-3xl sm:text-4xl font-black tracking-tight ${
            !annualTargetKnown
              ? 'text-slate-400 dark:text-slate-500'
              : overall.remaining > 0 ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'
          }`}>
            {annualTargetKnown ? formatNumber(overall.remaining) : '—'}
          </span>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
            {!annualTargetKnown
              ? 'needs the annual targets'
              : overall.remaining === 0 ? 'target reached' : 'installations to the annual target'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 flex flex-col justify-between">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Required Pace</p>
          <span className={`text-3xl sm:text-4xl font-black tracking-tight ${accentText}`}>
            {overall.requiredPerMonth != null ? formatNumber(Math.ceil(overall.requiredPerMonth)) : '—'}
          </span>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
            {overall.requiredPerMonth != null
              ? `per month for the last ${ytd.monthsAfter} month${ytd.monthsAfter === 1 ? '' : 's'}`
              : annualTargetKnown ? 'no month left after this one' : 'needs the annual targets'}
          </p>
        </div>
      </div>

      {/* Month strip */}
      <div className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2.5">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Monthly Progress</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            value each month delivered · target underneath
          </p>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {months.map((_, index) => (
            <MonthCell
              key={index}
              index={index}
              actual={overall.series.actual[index]}
              target={overall.series.target[index] || 0}
              future={index > monthIndex}
              accentText={pc.text}
              collectionBased={collectionBased}
              onOpen={() => setOpenMonth(index)}
            />
          ))}
        </div>
        {recordNote && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 italic">{recordNote}</p>
        )}
      </div>

      {/* A month's own figures. Tap a cell on a phone; click it on a pointer — the tooltip
          above answers the same question, and this is the same answer, laid out. */}
      {openMonth !== null && (
        <MonthDetailModal
          index={openMonth}
          year={year}
          actual={overall.series.actual[openMonth]}
          target={overall.series.target[openMonth] || 0}
          future={openMonth > monthIndex}
          collectionBased={collectionBased}
          onClose={() => setOpenMonth(null)}
        />
      )}
    </section>
  )
}
