import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatPeso } from '../utils/dataProcessor'

/**
 * VelocityReport — actual daily completion pace vs the rate required to reach target.
 *
 * The run-rate projection already tells you *where* the month lands; this answers
 * the operational question behind it: how many jobs are actually closing per day,
 * how many need to close, and whether the gap is closing.
 *
 * Bars are per-day completions from the plan's DATA tab. The dashed line is the
 * required daily rate for the days remaining in the month, so any bar under the
 * line is a day that fell behind.
 *
 * `collectionBased` is SME: the plan's target is a peso figure and its pace is read in
 * money, so every figure here is an amount rather than a count, and the bars arrive as
 * daily collections. Everything else counts completed installations.
 *
 * A bar is a button: it opens that day's own figures, the way a month in the Monthly Progress
 * strip does. The tooltip stays for a pointer — a `title` is unreachable by touch.
 */
export default function VelocityReport({ projection, trend, collectionBased = false }) {
  // Which day's details are open, if any. Declared before the early return below — a hook
  // cannot sit behind a condition.
  const [openDay, setOpenDay] = useState(null)
  if (!projection) return null

  const { totalCompleted, target, daysElapsed, daysInMonth, rate, remainingDays, requiredDaily } = projection
  const toGo = Math.max(0, (target || 0) - (totalCompleted || 0))
  const done = requiredDaily === 0 || toGo === 0

  // A peso pace written as a bare number beside a peso target reads as a count, so the
  // rates, the drift and the bar tooltips all follow the plan's measure.
  const amount = (n, digits = 0) => (collectionBased ? formatPeso(n) : fmt(n, digits))
  const verb = collectionBased ? 'collected' : 'completed'
  const activity = collectionBased ? 'collections' : 'completions'

  const values = (trend && Array.isArray(trend.values) ? trend.values : []).filter((v) => typeof v === 'number' && !isNaN(v))
  const dates = (trend && Array.isArray(trend.dates) ? trend.dates : []) || []
  const hasChart = values.length >= 2

  // Recent momentum — the last week of actual output, independent of the
  // month-to-date average, which is dragged down by a slow start.
  const recent = values.slice(-7)
  const recentAvg = recent.length ? recent.reduce((s, v) => s + v, 0) / recent.length : null

  // Linear track: where a perfectly even month would put us by today.
  const linearExpect = (target || 0) * (daysElapsed / daysInMonth)
  const trackDelta = (totalCompleted || 0) - linearExpect

  // Pace verdict
  const ratio = requiredDaily > 0 ? rate / requiredDaily : null
  // "7.7× the current rate" only means something with a non-zero rate — a month
  // with no output yet has an undefined multiple, not a large one.
  const gapMultiple = ratio !== null && ratio < 1 && rate > 0 ? (requiredDaily / rate).toFixed(1) : null
  const verdict = done
    ? { label: 'Requirement cleared', cls: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/50', border: 'border-emerald-300 dark:border-emerald-500/40' }
    : ratio >= 1
      ? { label: 'Above required pace', cls: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-100 dark:bg-emerald-900/50', border: 'border-emerald-300 dark:border-emerald-500/40' }
      : ratio >= 0.8
        ? { label: 'Slightly under pace', cls: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/50', border: 'border-amber-300 dark:border-amber-500/40' }
        : { label: 'Well under pace', cls: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/50', border: 'border-red-300 dark:border-red-500/40' }

  // Projected finish day at the current month-to-date rate.
  let finishDay = null
  if (!done && rate > 0) finishDay = daysElapsed + toGo / rate

  const scaleMax = Math.max(...(hasChart ? values : [0]), requiredDaily || 0, 1)

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1622] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
        <h3 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Velocity</h3>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${verdict.bg} ${verdict.cls} ${verdict.border}`}>
          {verdict.label}
        </span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto">
          Day {daysElapsed} of {daysInMonth} · {remainingDays} left
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,260px)_1fr] gap-4 lg:gap-6">
        {/* Left: the two rates side by side */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/40 p-3">
              <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Actual</p>
              <p className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                {amount(rate, 1)}<span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 ml-1">/day</span>
              </p>
              <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">month-to-date avg</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/40 p-3">
              <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Required</p>
              <p className={`text-xl font-black tracking-tight ${done ? 'text-emerald-600 dark:text-emerald-400' : verdict.cls}`}>
                {amount(Math.ceil(requiredDaily))}<span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 ml-1">/day</span>
              </p>
              <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">{done ? 'target reached' : `for ${remainingDays} more days`}</p>
            </div>
          </div>

          <ul className="text-[11px] space-y-1.5">
            {!done && gapMultiple && (
              <li className="text-slate-600 dark:text-slate-300">
                Need <span className="font-bold text-rose-600 dark:text-rose-400">{gapMultiple}×</span> the current daily rate
              </li>
            )}
            {!done && rate <= 0 && (
              <li className="font-semibold text-rose-600 dark:text-rose-400">No {activity} recorded this month yet</li>
            )}
            {recentAvg !== null && (
              <li className="text-slate-600 dark:text-slate-300">
                Last {recent.length} days: <span className="font-semibold text-slate-900 dark:text-white">{amount(recentAvg, 1)}/day</span>
                {/* A money plan's series begins where its month does, so early in the month the recent
                    window is the whole month and reading it against the month-to-date rate says
                    nothing — the verdict arrives once there are days behind the window. */}
                {recent.length < values.length && (recentAvg >= rate
                  ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold"> · accelerating</span>
                  : <span className="text-amber-600 dark:text-amber-400 font-semibold"> · slowing</span>)}
              </li>
            )}
            <li className="text-slate-600 dark:text-slate-300">
              vs even track:{' '}
              <span className={`font-semibold ${trackDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {trackDelta >= 0 ? '+' : ''}{amount(trackDelta)}
              </span>
            </li>
            {finishDay !== null && (
              <li className="text-slate-600 dark:text-slate-300">
                At this rate: {finishDay <= daysInMonth
                  ? <span className="font-semibold text-slate-900 dark:text-white">finishes day {Math.ceil(finishDay)}</span>
                  : <span className="font-semibold text-rose-600 dark:text-rose-400">{Math.ceil(finishDay - daysInMonth)} days past month-end</span>}
              </li>
            )}
          </ul>
        </div>

        {/* Right: daily output vs the required line */}
        {hasChart ? (
          <div>
            <div className="relative h-[110px] flex items-end gap-[2px]">
              {values.map((v, i) => {
                const met = done || v >= requiredDaily
                const label = dates[i] || 'Day ' + (i + 1)
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setOpenDay(i)}
                    title={`${label} — ${amount(v)} ${verb}${!done ? ` (${v >= requiredDaily ? 'at/above' : 'under'} the ${amount(Math.ceil(requiredDaily))}/day required)` : ''}`}
                    aria-haspopup="dialog"
                    aria-label={`${label} — ${amount(v)} ${verb}. Open the day's details.`}
                    className="group flex-1 min-w-[3px] h-full flex items-end bg-transparent rounded-t-[2px] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60"
                  >
                    <span
                      className={`w-full rounded-t-[2px] transition-all duration-200 ${
                        done ? 'bg-slate-300 dark:bg-slate-600'
                          : met ? 'bg-emerald-500/80 dark:bg-emerald-400/70 group-hover:bg-emerald-500'
                            : 'bg-rose-400/60 dark:bg-rose-500/50 group-hover:bg-rose-400'
                      }`}
                      style={{ height: `${Math.max((v / scaleMax) * 100, 1.5)}%` }}
                    />
                  </button>
                )
              })}

              {!done && (
                <div
                  className="pointer-events-none absolute left-0 right-0 border-t-2 border-dashed border-amber-500/80 dark:border-amber-400/70"
                  style={{ bottom: `${Math.min((requiredDaily / scaleMax) * 100, 100)}%` }}
                >
                  <span className="absolute right-0 -top-4 text-[9px] font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                    required {amount(Math.ceil(requiredDaily))}/day
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between mt-1.5 text-[9px] text-slate-400 dark:text-slate-500">
              <span>{dates[0] || ''}</span>
              <span className="font-semibold">{values.length} days of {activity}</span>
              <span>{dates[values.length - 1] || ''}</span>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center p-6">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
              Not enough daily history yet to chart velocity — figures above still reflect the current pace.
            </p>
          </div>
        )}
      </div>

      {/* The day behind a bar. A bar can only say that a day came in under the line; this is
          what the day brought in, what it was asked for, and what the difference was. */}
      {openDay !== null && values[openDay] !== undefined && (
        <DayDetailModal
          date={dates[openDay]}
          index={openDay}
          value={values[openDay]}
          required={requiredDaily}
          through={values.slice(0, openDay + 1).reduce((sum, v) => sum + v, 0)}
          throughLabel={collectionBased ? 'Month to date' : `Last ${openDay + 1} days`}
          done={done}
          collectionBased={collectionBased}
          onClose={() => setOpenDay(null)}
        />
      )}
    </div>
  )
}

/** One line of a day's details: a label on the left, the figure on the right. */
function DetailRow({ label, value, tone = 'text-slate-800 dark:text-slate-100', big = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
      <span className={`tabular-nums ${big ? 'text-xl font-black' : 'text-sm font-bold'} ${tone}`}>{value}</span>
    </div>
  )
}

/**
 * One day of the chart, laid out — what the bar's tooltip says, for a screen that cannot hover.
 *
 * A day is read against the same required rate the chart's dashed line draws, so a day's
 * shortfall here is the gap the bar's own length falls short of: the amount collected (or the
 * work completed) that day, next to what that day needed to bring.
 *
 * Exported so a probe can render the card directly — `createPortal` renders nothing on a
 * server, which is where the rest of this file is checked.
 */
export function DayDetailCard({ date, index, value, required, through, throughLabel, done, collectionBased = false, onClose }) {
  // A rate the chart displays, so it rounds the way the chart's own label does — a peso plan
  // in whole pesos, a ticket plan in whole installations.
  const money = (n) => (collectionBased ? formatPeso(n) : fmt(n))
  const goal = Math.ceil(required)
  const met = done || value >= required
  const difference = Math.abs(goal - value)
  const share = goal > 0 ? (value / goal) * 100 : null

  const verdict = done
    ? 'The month’s target is already cleared — this day no longer has a rate to meet.'
    : met
      ? 'This day met the rate the rest of the month needs.'
      : `This day came in ${money(difference)} short of the rate the rest of the month needs.`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="velocity-day-title"
      onClick={(e) => e.stopPropagation()}
      className="w-full max-w-xs rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#0E1622] shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
        <h3 id="velocity-day-title" className="flex items-baseline gap-2 text-sm font-black tracking-tight text-slate-800 dark:text-slate-100">
          {date || `Day ${index + 1}`}
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Velocity</span>
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
        <DetailRow
          label={collectionBased ? 'Collected' : 'Completed'}
          value={money(value)}
          big
          tone={met ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
        />
        <DetailRow label="Required that day" value={money(goal)} />
        <DetailRow
          label={done ? 'Requirement' : met ? 'Above by' : 'Short by'}
          value={done ? '—' : money(difference)}
          tone={done || met ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
        />
        <DetailRow label="Of the day’s requirement" value={share === null ? '—' : `${share.toFixed(0)}%`} />
        <DetailRow label={throughLabel} value={money(through)} />
      </div>

      <p className="px-4 pb-3 text-[11px] italic text-slate-500 dark:text-slate-400">{verdict}</p>

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
 * The dialog itself: the day's figures sit in a portaled overlay so the chart's own height
 * cannot clip them. A sheet on a phone, a centered card from `sm` up. Backdrop click and
 * Escape both close it, the way a month in the Monthly Progress strip does.
 */
function DayDetailModal({ onClose, ...rest }) {
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
      <DayDetailCard onClose={onClose} {...rest} />
    </div>,
    document.body,
  )
}

function fmt(n, digits = 0) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}
